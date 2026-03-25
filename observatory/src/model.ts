export type RoomType = 'commons' | 'private_request_interior' | 'spawned_space';

export type SemanticEventKind =
  | 'room_discovered'
  | 'intent_posted'
  | 'steward_visible'
  | 'promise_posted'
  | 'accept_posted'
  | 'complete_posted'
  | 'assess_posted'
  | 'decline_posted'
  | 'message_posted';

export interface RoomEvent {
  id: string;
  roomId: string;
  kind: SemanticEventKind;
  label: string;
  actorId: string;
  timestamp: number;
  seq?: number;
  raw: Record<string, unknown>;
}

export interface RoomSummary {
  id: string;
  type: RoomType;
  title: string;
  subtitle: string;
  visibility: 'public' | 'private';
  participants: string[];
  connectedTo?: string;
  updatedAt: number;
  eventCount: number;
  preview: string;
}

export interface RoomEdge {
  from: string;
  to: string;
  kind: 'contains' | 'fulfills';
}

export interface ObservatorySnapshot {
  generatedAt: number;
  label?: string;
  headwatersOrigin: string;
  dataDir: string;
  rooms: RoomSummary[];
  edges: RoomEdge[];
  eventsByRoom: Record<string, RoomEvent[]>;
}
