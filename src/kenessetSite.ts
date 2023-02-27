import fetch from "node-fetch";
import { Bechirot } from "./types";
import { clearLastLine } from "./utils.js";

export default async function scrap(): Promise<Bechirot[]> {
  const elections = [];
  let i = 0;
  let maxKnesset = 0;
  console.log("scraping knesset website...");

  do {
    i++;
    const res = (await (
      await fetch(
        `https://knesset.gov.il/WebSiteApi/knessetapi/Knesset/GetKnessetDetails?knessetId=${i}&lang=HE`
      )
    ).json()) as KnessetSiteApiResult;
    maxKnesset = Math.max(...res.KnessetsBullets.map((v) => v.ID));
    const { ElectionDate, Threshold, MandateVotes, EligibleCount, CleanVotes } =
      res.ElectionsKnessetDetails[0];
    const asParties = res.ElectionsLists.map((p) => ({
      votes: p.CleanVotesNum,
      mandates: p.MandateNum,
      votesPercent: p.VotesPrecent,
      name: p.ListName,
      color: p.ColorName,
      error: Math.abs(
        p.CleanVotesNum - CleanVotes * (p.VotesPrecent / 100)
      ).toFixed(3),
    }));
    const election = {
      parties: asParties,
      thresholdPercent: Threshold,
      oneMandate: MandateVotes,
      eligibleVoters: EligibleCount,
      legalVotes: CleanVotes,
      date: new Date(ElectionDate),
      bechirotNum: i,
    };
    elections.push(election);
    i > 1 && clearLastLine();
    console.log("done", i, "of", maxKnesset);
  } while (i < maxKnesset);
  return elections;
}

interface KnessetHeader {
  KnessetId: number;
  KnessetName: string;
  KnessetBeginDate: string;
  KnessetEndDate: string;
  KnessetHebrewBeginDate: string;
  KnessetHebrewEndDate: string;
  ElectionDate: string;
  FirstMeetingDate: string;
  LastMeetingDate: string;
  FirstHebrewMeetingDate: string;
  LastHebrewMeetingDate: string;
  KnessetElectionDateMobile: string;
  KnessetBeginDateMobile: string;
  KnessetEndDateMobile: string;
  ElectedLists: number;
  FactionsCount: number;
  YearCount: number;
  MonthCount: number;
  KnessetDuration: string;
}

interface ElectionsKnessetDetail {
  ElectionDate: string;
  EligibleCount: number;
  CleanVotes: number;
  Threshold: string;
  MandateVotes: number;
}

interface ElectionsList {
  ListName: string;
  CleanVotesNum: number;
  VotesPrecent: number;
  MandateNum: number;
  rn: number;
  ColorName: string;
}

interface MainEvent {
  FK_KnessetID: number;
  EventDate: string;
  ActualDate: string;
  EventYear: string;
  EventDescription: string;
  TimeLineDisplay: boolean;
  imgPath: string;
  YearColor: string;
  TimelineBulletColor: string;
  EventHeaderColor: string;
  EventBorderColor: string;
  ReadMoreBulletColor: string;
}

interface Review {
  KnessetReview: string;
}

interface Chairman {
  MkID: string;
  MkName: string;
  MkNameAdd: string;
  href: string;
}

interface ViceChairman {
  MkID: string;
  MkName: string;
  MkNameAdd?: any;
  href: string;
}

interface SecritaryKnesset {
  MkID?: any;
  MkName: string;
  MkNameAdd?: any;
}

interface FactionList {
  FactionName: string;
  VotesPrecent: number;
  MandateNum: number;
  SeatsNum: number;
  FactionLink: string;
}

interface FactionNote {
  FactionNotes: string;
}

interface KnessetMenuItem {
  Name: string;
  ParentName: string;
  Title: string;
  Ordinal: number;
  MenuType: string;
  MenuSubType: string;
  LinkUrl: string;
  LinkParentUrl: string;
  imgPath: string;
  TemplateID?: number;
}

interface KnessetVideo {
  YoutubeEmbeddedID: string;
  VideoDescription: string;
}

interface KnessetsBullet {
  ID: number;
  IsSelectedKnesset: number;
}

export interface KnessetSiteApiResult {
  KnessetHeader: KnessetHeader[];
  ElectionsKnessetDetails: ElectionsKnessetDetail[];
  ElectionsPMDirect: any[];
  ElectionsLists: ElectionsList[];
  MainEvents: MainEvent[];
  Review: Review[];
  Chairmans: Chairman[];
  ViceChairmans: ViceChairman[];
  SecritaryKnesset: SecritaryKnesset[];
  FactionLists: FactionList[];
  FactionNotes: FactionNote[];
  KnessetMenuItems: KnessetMenuItem[];
  KnessetVideos: KnessetVideo[];
  KnessetsBullets: KnessetsBullet[];
}
