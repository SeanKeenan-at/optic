import fetch from 'node-fetch';
import { JsonHttpClient } from './JsonHttpClient';
// TODO created shared instance to import from (optic cloud fe + here)

type Session = {
  owner: string;
  repo: string;
  commit_hash: string;
  pull_request: number;
  run: number;
  branch_name: string;
  from_arg: string | null;
  to_arg: string | null;
  status: 'completed' | 'started' | 'noop' | 'error';
  metadata?: any;
};

export type RulesetConfig = {
  config: {
    ruleset: { name: string; config: unknown }[];
  };
  organization_id: string;
  ruleset_id: string;
  created_at: string;
  updated_at: string;
};

export enum UploadSlot {
  FromFile = 'FromFile',
  ToFile = 'ToFile',
  CheckResults = 'CheckResults',
  FromSourceMap = 'FromSourceMap',
  ToSourceMap = 'ToSourceMap',
}

export enum LegacyUploadSlot {
  FromFile = 'FromFile',
  ToFile = 'ToFile',
  CheckResults = 'CheckResults',
}

export type UploadUrl = {
  id: string;
  slot: UploadSlot;
  url: string;
};

type SessionFile = {
  slot: UploadSlot;
  url: string;
};

export enum SessionStatus {
  Ready = 'ready',
  NotReady = 'not_ready',
}

export type GetSessionResponse = {
  web_url: string;
  session: Session;
  status: SessionStatus;
  files: SessionFile[];
};

export type GetSessionStatusResponse = {
  status: Session['status'];
  metadata: {
    polling_wait_time: number;
  };
};

type GetMyOrganizationResponse = {
  id: string;
  name: string;
  git_api_url: string;
  git_web_url: string;
  git_provider: string;
};

export class OpticBackendClient extends JsonHttpClient {
  constructor(
    private baseUrl: string,
    private getAuthToken: () => Promise<string>
  ) {
    super();
  }

  // TODO - fix this typing - node-fetch has isRedirect on the fn object
  // @ts-ignore
  fetch: typeof fetch = async (requestUri, options = {}) => {
    const token = await this.getAuthToken();
    const headers = options.headers || {};

    return fetch(`${this.baseUrl}${requestUri}`, {
      ...options,
      headers: {
        ...headers,
        Authorization: `Token ${token}`,
      },
    });
  };

  public getWebBase(): string {
    return process.env.OPTIC_ENV === 'staging'
      ? 'https://app.o3c.info'
      : process.env.OPTIC_ENV === 'local'
      ? 'http://localhost:3000'
      : 'https://app.useoptic.com';
  }

  public async getUploadUrls(
    sessionId: string,
    slots: UploadSlot[] = []
  ): Promise<UploadUrl[]> {
    let params = '';
    if (slots.length > 0) {
      params = '?' + new URLSearchParams({ slots: slots.join(',') }).toString();
    }

    const response = await this.getJson<{
      upload_urls: UploadUrl[];
    }>(`/api/runs/${sessionId}/uploads${params}`);
    return response.upload_urls;
  }

  public async createSession(session: {
    owner: string;
    repo: string;
    commit_hash: string;
    pull_request: number;
    run: number;
    branch_name: string;
    from_arg: string | null;
    to_arg: string | null;
    status?: 'started' | 'completed';
    spec_id?: string;
    ruleset?: { name: string; config: any }[];
  }): Promise<string> {
    const { id: sessionId } = await this.postJson(`/api/runs`, {
      ...session,
    });
    return sessionId;
  }

  public async startSession(sessionId: string): Promise<void> {
    await this.postJson(`/api/runs/${sessionId}/start`, {});
  }

  public async markUploadAsComplete(
    sessionId: string,
    uploadId: string
  ): Promise<void> {
    await this.patchJson(`/api/runs/${sessionId}/uploads/${uploadId}`, {
      status: 'Unverified',
    });
  }

  public async getSession(sessionId: string): Promise<GetSessionResponse> {
    return this.getJson<GetSessionResponse>(`/api/runs/${sessionId}`);
  }

  public async getSessionStatus(
    sessionId: string
  ): Promise<GetSessionStatusResponse> {
    return this.getJson<GetSessionStatusResponse>(
      `/api/runs/${sessionId}/status`
    );
  }

  public async getMyOrganization(): Promise<GetMyOrganizationResponse> {
    return this.getJson<GetMyOrganizationResponse>(`/api/my-organization`);
  }

  public async createRuleset(
    name: string,
    description: string,
    config_schema: any
  ): Promise<{
    id: string;
    upload_url: string;
    ruleset_url: string;
  }> {
    return this.postJson(`/api/rulesets`, {
      name,
      description,
      config_schema,
    });
  }

  public async patchRuleset(
    rulesetId: string,
    uploaded: boolean
  ): Promise<void> {
    return this.patchJson(`/api/rulesets/${rulesetId}`, {
      uploaded,
    });
  }

  public async getManyRulesetsByName(rulesets: string[]): Promise<{
    rulesets: ({
      name: string;
      url: string;
      uploaded_at: string;
    } | null)[];
  }> {
    const encodedRulesets = rulesets
      .map((r) => encodeURIComponent(r))
      .join(',');
    return this.getJson(`/api/rulesets?rulesets=${encodedRulesets}`);
  }

  public async getRuleConfig(
    rulesetConfigIdentifier: string
  ): Promise<RulesetConfig> {
    const encodedIdentifier = encodeURIComponent(rulesetConfigIdentifier);
    return this.getJson(`/api/ruleset-configs/${encodedIdentifier}`);
  }
}

export const createOpticClient = (opticToken: string) => {
  const hostOverride = process.env.BWTS_HOST_OVERRIDE;
  const backendWebBase = hostOverride
    ? hostOverride
    : process.env.OPTIC_ENV === 'staging'
    ? 'https://api.o3c.info'
    : 'https://api.useoptic.com';

  const opticClient = new OpticBackendClient(backendWebBase, () =>
    Promise.resolve(opticToken)
  );
  return opticClient;
};
