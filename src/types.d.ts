export interface Party {
  votes: number;
  mandates: number;
  votesPercent: number;
  name: string;
  color: string;
  error: string;
}

export interface Bechirot {
  parties: Party[];
  thresholdPercent: string;
  oneMandate: number;
  eligibleVoters: number;
  legalVotes: number;
  date: Date;
  bechirotNum: number;
}
