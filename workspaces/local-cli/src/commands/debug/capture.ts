import { Command } from '@oclif/command';
import { CaptureInteractionIterator } from '@useoptic/cli-shared/build/captures/avro/file-system/interaction-iterator';
import { getPathsRelativeToConfig, readApiConfig } from '@useoptic/cli-config';
import OS from 'os';
import cli from 'cli-ux';
import path from 'path';
import colors from 'colors';
import fs from 'fs-extra';
import { IgnoreFileHelper } from '@useoptic/cli-config/build/helpers/ignore-file-interface';
import { getOrCreateAnonId } from '@useoptic/cli-config/build/opticrc/optic-rc';
import { getSpecEventsFrom } from '@useoptic/cli-config/build/helpers/read-specification-json';
import { CapturesHelpers } from '@useoptic/cli-server/build/routers/spec-router';
const pJson = require('../../../package.json');

export default class DebugCapture extends Command {
  static description =
    'produce a debug file (with sanitized interactions) that can be shared with Optic maintainers';
  static hidden: boolean = true;

  static args = [
    {
      name: 'captureId',
      description: 'the captureId, see the address bar /diffs/local/{this-id}',
      required: false,
    },
  ];

  async run() {
    const { args } = this.parse(DebugCapture);
    const { captureId } = args;

    const {
      capturesPath,
      configPath,
      basePath,
      opticIgnorePath,
      specStorePath,
    } = await getPathsRelativeToConfig();

    const capturesHelper = new CapturesHelpers(capturesPath);
    const captures = await capturesHelper.listCaptureIds();

    if (!captureId || !captures.includes(captureId)) {
      if (captures.length === 0) {
        return this.error('no captures found');
      }

      this.log(
        colors.red.bold(
          'run api debug:capture <captureId>     | with one of these IDs:\n\n'
        )
      );
      captures.forEach((i) => this.log(i));
      return;
    }

    cli.action.start('sanitizing json bodies...');

    const configJson = await readApiConfig(configPath);
    const events = await getSpecEventsFrom(specStorePath);
    const ignoreRules = await new IgnoreFileHelper(
      opticIgnorePath,
      configPath
    ).getCurrentIgnoreRules();

    const interactionIterator = CaptureInteractionIterator(
      {
        captureId: captureId,
        captureBaseDirectory: capturesPath,
      },
      (i) => true
    );

    const cleanedInteraction = [];

    for await (const item of interactionIterator) {
      if (!item.interaction) {
        continue;
      }
      const { batchId, index } = item.interaction.context;

      const itemValue = item.interaction.value;

      cli.action.start(
        'sanitizing json bodies...',
        item.diffedInteractionsCounter.toString()
      );
      //question? do we want to fill in a similar quantity of bytes for non json?
      itemValue.request.body.value.asJsonString = null;
      itemValue.request.body.value.asText = null;
      itemValue.response.body.value.asJsonString = null;
      itemValue.response.body.value.asText = null;

      cleanedInteraction.push(itemValue);
    }

    const result = {
      events,
      configJson,
      ignoreRules,
      session: {
        samples: cleanedInteraction,
      },
      opticVersion: pJson.version,
      os: {
        arch: OS.arch(),
        cpus: OS.cpus(),
        memory: OS.totalmem(),
      },
    };

    cli.action.stop('Done!');
    const anonId = await getOrCreateAnonId();
    const savePath = path.join(
      basePath,
      '../',
      `debug-optic-${Date.now().toString()}-${anonId}.json`
    );
    fs.writeJson(savePath, result);
    this.log('saved to: ' + savePath);
  }
}
