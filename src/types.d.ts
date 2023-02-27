interface CitedData {
  source: string;
}

export interface Party extends CitedData {
  votes?: number;
  mandates: number;
  votesPercent?: number;
  name: string;
  color?: string;
  letters?: string;
  error?: string;
}

export interface Bechirot extends CitedData {
  parties: Party[];
  thresholdPercent?: string;
  oneMandate: number;
  eligibleVoters: number;
  legalVotes: number;
  date: Date;
  bechirotNum: number;
}
