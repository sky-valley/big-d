export interface Env {
  CONTROL: DurableObjectNamespace;
  SPACES: DurableObjectNamespace;
}

export interface PreparedSpaceRecord {
  spaceId: string;
  status: 'prepared' | 'claimed';
  intendedAgentLabel: string;
  claimToken: string;
  createdAt: string;
  claimPath: string;
  bundlePath: string;
}

export interface HostedSpaceRecord {
  spaceId: string;
  status: 'prepared' | 'claimed';
  intendedAgentLabel: string;
  createdAt: string;
  stewardId: string;
  serviceIntentId: string;
  serviceIntentContent: string;
}

export interface SpaceBundle extends PreparedSpaceRecord {
  origin: string;
}
