import { Command, flags } from '@oclif/command';
//@ts-ignore
import gitRev from '../shared/git/git-rev-sync-insourced.js';
import { ensureDaemonStarted } from '@useoptic/cli-server';
import { lockFilePath } from '../shared/paths';
import { Config } from '../config';
//@ts-ignore
import groupBy from 'lodash.groupby';
import EventSource from 'eventsource';
//@ts-ignore
import padLeft from 'pad-left';
import {
  cleanupAndExit,
  developerDebugLogger,
  fromOptic,
  makeUiBaseUrl,
  userDebugLogger,
} from '@useoptic/cli-shared';
import { Client, SpecServiceClient } from '@useoptic/cli-client';
import { EventEmitter } from 'events';
import {
  getPathsRelativeToConfig,
  IApiCliConfig,
  IPathMapping,
  readApiConfig,
} from '@useoptic/cli-config';
import { getCaptureId, isInRepo } from '../shared/git/git-context-capture';
import fs from 'fs-extra';
import { IgnoreFileHelper } from '@useoptic/cli-config/build/helpers/ignore-file-interface';
import { JsonHttpClient } from '@useoptic/client-utilities';
import colors from 'colors';
import { getUser, opticTaskToProps, trackUserEvent } from '../shared/analytics';
import { cli } from 'cli-ux';
import { makeDiffRfcBaseStateFromEvents } from '@useoptic/cli-shared/build/diffs/diff-rfc-base-state';
import { IDiff } from '@useoptic/cli-shared/build/diffs/diffs';
import { locationForTrails } from '@useoptic/cli-shared/build/diffs/trail-parsers';
import { IInteractionTrail } from '@useoptic/cli-shared/build/diffs/interaction-trail';
import { IRequestSpecTrail } from '@useoptic/cli-shared/build/diffs/request-spec-trail';
import sortBy from 'lodash.sortby';
import openBrowser from 'react-dev-utils/openBrowser';
import { StatusRun } from '@useoptic/analytics/lib/events/status';
import * as uuid from 'uuid';
import { getSpecEventsFrom } from '@useoptic/cli-config/build/helpers/read-specification-json';
import { linkToCapture } from '../shared/ui-links';

interface SpecEndpointDescriptor {
  httpMethod: string;
  method: string;
  pathId: string;
  requestBodies: any[];
  responses: any[];
  isEmpty: boolean;
}

export interface KnownEndpoint {
  method: string;
  pathId: string;
  fullPath: string;
  descriptor: SpecEndpointDescriptor;
}

export default class Status extends Command {
  static description = 'lists API diffs observed since your last git commit';

  static flags = {
    'pre-commit': flags.boolean(),
    review: flags.boolean(),
  };

  async run() {
    const { flags } = this.parse(Status);

    const timeStated = Date.now();

    let diffFound = false;
    const exitOnDiff = Boolean(flags['pre-commit']);
    const openReviewPage = Boolean(flags['review']);

    let { paths, config } = (await this.requiresSpec())!;

    await this.requiresInGit(paths.basePath);

    const captureId = await getCaptureId(paths);
    developerDebugLogger('using capture id ', captureId);

    if (openReviewPage) {
      return this.openDiffPage(paths.cwd, captureId);
    }

    const diffsPromise = this.getDiffsAndEvents(paths, captureId);
    diffsPromise.catch((e) => {
      console.error(e);
      this.printStatus([], [], []);
    });
    diffsPromise.then(async ({ diffs, undocumentedUrls, events }) => {
      const rfcBaseState = makeDiffRfcBaseStateFromEvents(events);
      const diffsRaw: IDiff[] = diffs.map((i: any) => i[0]);

      const locations = diffsRaw
        .map((i) => {
          return locationForTrails(
            extractRequestsTrail(i),
            extractInteractionTrail(i),
            rfcBaseState
          )!;
        })
        .filter(Boolean);

      const diffsGroupedByPathAndMethod = groupBy(
        locations,
        (i: any) => `${i.method}.${i.pathId}`
      );

      const endpointsWithDiffs = getSpecEndpoints(
        rfcBaseState.queries
      ).filter((i) =>
        locations.find(
          (withDiff) =>
            withDiff.pathId === i.pathId && withDiff.method === i.method
        )
      );

      this.printStatus(
        endpointsWithDiffs,
        diffsGroupedByPathAndMethod,
        undocumentedUrls
      );

      diffFound = diffs.length > 0 || undocumentedUrls.length > 0;

      await trackUserEvent(
        config.name,
        StatusRun.withProps({
          captureId,
          diffCount: diffs.length,
          undocumentedCount: undocumentedUrls.length,
          timeMs: Date.now() - timeStated,
        })
      );
    });

    diffsPromise.finally(() => {
      if (diffFound && exitOnDiff) {
        console.error(
          colors.red('Optic detected an API diff. Run "api status --review"')
        );
        process.exit(1);
      }
      cleanupAndExit();
    });
  }

  async exitWithError(error: string) {
    this.log(fromOptic(error));
    process.exit(0);
  }

  async requiresInGit(basepath: string) {
    if (isInRepo(basepath)) {
      return;
    } else {
      await this.exitWithError(
        `"${colors.bold('api status')}" only works when Optic is in a Git repo`
      );
    }
  }

  async requiresSpec(): Promise<
    | {
        paths: IPathMapping;
        config: IApiCliConfig;
      }
    | undefined
  > {
    let paths: IPathMapping;
    let config: IApiCliConfig;

    try {
      paths = await getPathsRelativeToConfig();
      config = await readApiConfig(paths.configPath);
      return { paths, config };
    } catch (e) {
      userDebugLogger(e);
      await this.exitWithError(
        `No optic.yml file found here. Add Optic to your API by running ${colors.bold(
          'api init'
        )}`
      );
    }
  }

  async getDiffsAndEvents(paths: IPathMapping, captureId: string) {
    const daemonState = await ensureDaemonStarted(
      lockFilePath,
      Config.apiBaseUrl
    );

    const apiBaseUrl = `http://localhost:${daemonState.port}/api`;
    developerDebugLogger(`api base url: ${apiBaseUrl}`);
    const cliClient = new Client(apiBaseUrl);
    cliClient.setIdentity(await getUser());
    const cliSession = await cliClient.findSession(paths.cwd, null, null);
    developerDebugLogger({ cliSession });

    const eventEmitter = new EventEmitter();
    const specService = new SpecServiceClient(
      cliSession.session.id,
      eventEmitter,
      apiBaseUrl
    );

    const ignoreHelper = new IgnoreFileHelper(
      paths.opticIgnorePath,
      paths.configPath
    );
    const ignoreRules = (await ignoreHelper.getCurrentIgnoreRules()).allRules;
    const events = await getSpecEventsFrom(paths.specStorePath);

    const startDiffUrl = `${apiBaseUrl}/specs/${cliSession.session.id}/captures/${captureId}/diffs`;

    const { diffId, notificationsUrl } = await JsonHttpClient.postJson(
      startDiffUrl,
      {
        ignoreRules,
        additionalCommands: [],
        events,
        filters: [],
      }
    );

    const getDiffsUrl = `${apiBaseUrl}/specs/${cliSession.session.id}/captures/${captureId}/diffs/${diffId}/diffs`;
    const getUndocumentedUrlsUrl = `${apiBaseUrl}/specs/${cliSession.session.id}/captures/${captureId}/diffs/${diffId}/undocumented-urls`;

    const notificationChannel = new EventSource(
      `http://localhost:${daemonState.port}` + notificationsUrl
    );

    // let customBar: any | undefined;
    let totalInteractions = 0;
    cli.action.start('computing diffs for observations');
    specService.getCaptureStatus(captureId).then(({ interactionsCount }) => {
      totalInteractions = interactionsCount;
    });

    await new Promise((resolve, reject) => {
      notificationChannel.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);
        if (type === 'message') {
          cli.action.start(
            `computing diffs for observations ${
              parseInt(data.diffedInteractionsCounter) +
              parseInt(data.skippedInteractionsCounter)
            }${totalInteractions > 0 ? `/${totalInteractions.toString()}` : ''}`
          );
          if (!data.hasMoreInteractions) {
            cli.action.stop('done');
            resolve(undefined);
          }
        } else if (type === 'error') {
          cli.action.stop('done');
          reject();
        }
      };
      notificationChannel.onerror = function (err) {
        reject();
      };
    });

    notificationChannel.close();

    const diffs = await JsonHttpClient.getJson(getDiffsUrl);
    const undocumentedUrls = await JsonHttpClient.getJson(
      getUndocumentedUrlsUrl
    );

    return {
      diffs,
      events,
      undocumentedUrls: undocumentedUrls.urls,
    };
  }

  private printStatus(
    endpointsWithDiffs: KnownEndpoint[],
    diffsGroupedByPathAndMethod: any,
    undocumentedUrls: any[]
  ) {
    const diffCount = (i: KnownEndpoint) =>
      (diffsGroupedByPathAndMethod[`${i.method}.${i.pathId}`] || []).length;

    const sorted = sortBy(endpointsWithDiffs, (i) => -diffCount(i));
    const changed = sorted.map((i) =>
      colors.yellow(generateEndpointString(i.method, i.fullPath))
    );

    if (changed.length === 0) {
      this.log(`✓  No diffs observed for existing endpoints`);
    } else {
      this.log(colors.bold(`   Diffs observed for existing endpoints`));
      this.log(
        colors.grey(
          `     (use ${colors.bold(
            '"api status --review"'
          )} to review in the UI`
        )
      );
      this.log(changed.join('\n'));
    }

    const ordered = sortBy(undocumentedUrls, ['count', 'path']).reverse();

    const onlyShow = 15;
    const newUrls = ordered
      .slice(0, onlyShow)
      .map((i) => colors.green(generateEndpointString(i.method, i.path)));

    if (ordered.length === 0) {
      this.log(`✓  No undocumented URLs observed`);
    } else {
      this.log(colors.bold(`   Undocumented URLs observed`));
      this.log(
        colors.grey(
          `      (use ${colors.bold(
            '"api status --review"'
          )} to start documenting them`
        )
      );
      this.log(newUrls.join('\n'));
      if (ordered.length > onlyShow) {
        this.log(`   and ${ordered.length - onlyShow} more...`);
      }
    }
  }

  async openDiffPage(basePath: string, captureId: string) {
    const daemonState = await ensureDaemonStarted(
      lockFilePath,
      Config.apiBaseUrl
    );

    const apiBaseUrl = `http://localhost:${daemonState.port}/api`;
    developerDebugLogger(`api base url: ${apiBaseUrl}`);
    const cliClient = new Client(apiBaseUrl);
    cliClient.setIdentity(await getUser());
    const cliSession = await cliClient.findSession(basePath, null, null);
    developerDebugLogger({ cliSession });
    const uiBaseUrl = makeUiBaseUrl(daemonState);
    const uiUrl = `${uiBaseUrl}/apis/${cliSession.session.id}/review/${captureId}`;
    openBrowser(linkToCapture(uiBaseUrl, cliSession.session.id, captureId));
    cleanupAndExit();
  }
}

function generateEndpointString(method: string, fullPath: string) {
  return `${colors.bold(padLeft(method, 13, ' '))}   ${fullPath}`;
}

function extractInteractionTrail(i: IDiff): IInteractionTrail {
  const kind: string = Object.keys(i)[0];
  // @ts-ignore
  return i[kind]!.interactionTrail;
}
function extractRequestsTrail(i: IDiff): IRequestSpecTrail {
  const kind: string = Object.keys(i)[0];
  // @ts-ignore
  return i[kind]!.requestsTrail;
}

export function createEndpointDescriptor(
  { method, pathId }: { method: string; pathId: string },
  cachedQueryResults: {
    requests: any[];
    pathsById: { [id: string]: any };
    requestIdsByPathId: { [id: string]: any };
    responsesArray: any[];
    contributions: any;
  }
): SpecEndpointDescriptor {
  const {
    requests,
    pathsById,
    requestIdsByPathId,
    responsesArray,
    contributions,
  } = cachedQueryResults;

  const requestIdsOnPath = (requestIdsByPathId[pathId] || []).map(
    (requestId: any) => requests[requestId]
  );
  const requestsOnPathAndMethod = requestIdsOnPath.filter(
    (request: any) =>
      request.requestDescriptor.httpMethod === method.toUpperCase()
  );

  const requestBodies = requestsOnPathAndMethod.map(
    //@ts-ignore
    ({ requestId, requestDescriptor }) => {
      const requestBody = getNormalizedBodyDescriptor(
        requestDescriptor.bodyDescriptor
      );
      return {
        requestId,
        requestBody,
      };
    }
  );

  const responsesForPathAndMethod = sortBy(
    responsesArray
      .filter(
        (response) =>
          response.responseDescriptor.httpMethod === method.toUpperCase() &&
          response.responseDescriptor.pathId === pathId
      )
      .map(({ responseId, responseDescriptor }) => {
        const responseBody = getNormalizedBodyDescriptor(
          responseDescriptor.bodyDescriptor
        );
        return {
          responseId,
          responseBody,
          statusCode: responseDescriptor.httpStatusCode,
        };
      }),
    ['statusCode']
  );

  return {
    httpMethod: method,
    method,
    pathId,
    requestBodies,
    responses: responsesForPathAndMethod,
    isEmpty:
      requestBodies.length === 0 && responsesForPathAndMethod.length === 0,
  };
}

function getNormalizedBodyDescriptor(value: any) {
  if (value && value.ShapedBodyDescriptor) {
    return value.ShapedBodyDescriptor;
  }
  return {};
}

function getCachedQueryResults(queries: any) {
  const contributions = queries.contributions();

  const {
    requests,
    pathComponents,
    responses,
    requestParameters,
  } = queries.requestsState();
  const pathIdsByRequestId = queries.pathsWithRequests();
  const pathsById = pathComponents;
  // const absolutePaths = Object.keys(pathsById).map(pathId => ({ [pathId]: queries.absolutePath(pathId) })).reduce((acc, value) => Object.assign(acc, value), {})
  // console.log({ absolutePaths })
  const pathIdsWithRequests = new Set(Object.values(pathIdsByRequestId));

  const endpoints = queries.endpoints();
  const shapesState = queries.shapesState();
  const shapesResolvers = queries.shapesResolvers();
  const requestIdsByPathId = Object.entries(pathIdsByRequestId).reduce(
    (acc, entry: any) => {
      const [requestId, pathId] = entry;
      //@ts-ignore
      const value = acc[pathId] || [];
      value.push(requestId);
      //@ts-ignore
      acc[pathId] = value;
      return acc;
    },
    {}
  );
  const cachedQueryResults = {
    contributions,
    requests,
    requestParameters,
    responses,
    responsesArray: Object.values(responses),
    pathIdsByRequestId,
    requestIdsByPathId,
    pathsById,
    endpoints,
    pathIdsWithRequests,
    shapesState,
    shapesResolvers,
  };
  return cachedQueryResults;
}

function getSpecEndpoints(queries: any): KnownEndpoint[] {
  const endpoints = queries.endpoints();
  const cachedQueryResults = getCachedQueryResults(queries);
  const allEndpoints = endpoints.map((i: any) => ({
    ...i,
    fullPath: queries.absolutePath(i.pathId),
    descriptor: createEndpointDescriptor(i, cachedQueryResults),
  }));

  return sortBy(allEndpoints, (i) => i.fullPath);
}
