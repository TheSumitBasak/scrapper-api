export interface CrawlerSession {
  token: string;
  totalLinks: number;
  links: string[];
  remainingQueue: number;
}

export interface CrawlerSessionState {
  queue: string[];
  crawling?: Set<string>;
  visited: Set<string>;
  allLinks: Set<string>;
  token: string;
}
