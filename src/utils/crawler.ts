import { CrawlerSessionState } from "@/types/crawlerSession";
import puppeteer, { Browser } from "puppeteer";

function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.pathname !== "/" && parsedUrl.pathname.endsWith("/")) {
      parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
    }
    return parsedUrl.href;
  } catch {
    return url;
  }
}

async function crawlSPA(
  currentUrl: string,
  baseUrl: string,
  session: CrawlerSessionState,
  browser: Browser
) {
  const page = await browser.newPage();

  try {
    await page.goto(currentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Optionally wait a bit (small delay) if you need AJAX to populate links
    await new Promise((resolve) => setTimeout(resolve, 500));

    const links: string[] = await page.evaluate(() => {
      const anchorTags = Array.from(document.querySelectorAll("a[href]"));
      return anchorTags
        .map((el: Element) => {
          const ele = el as HTMLAnchorElement;
          return ele.href;
        })
        .filter((link) => !!link && !link.includes("#aboutus"));
    });

    links.forEach((link) => {
      try {
        const absoluteUrl = new URL(link, baseUrl).href;
        const normalizedUrl = normalizeUrl(absoluteUrl);

        if (
          normalizedUrl.startsWith(baseUrl) &&
          !session.visited.has(normalizedUrl) &&
          !session.queue.includes(normalizedUrl)
        ) {
          session.queue.push(normalizedUrl);
        }
        if (normalizedUrl.startsWith(baseUrl))
          session.allLinks.add(normalizedUrl);
      } catch {
        // Ignore invalid URLs
      }
    });
  } catch (err) {
    console.error(
      `Puppeteer failed for ${currentUrl}:`,
      (err as Error).message
    );
  } finally {
    await page.close();
  }
}

export async function crawlWebsite(
  session: CrawlerSessionState,
  baseUrl: string,
  timeLimitSeconds = 20,
  concurrencyLimit = 5
) {
  const browser = await puppeteer.launch({ headless: true });

  const crawlController = (async () => {
    let crawlPromises: Promise<void>[] = [];

    while (session.queue.length > 0) {
      const currentUrl = session.queue.shift();
      if (!currentUrl) continue;

      const normalizedCurrentUrl = normalizeUrl(currentUrl);
      if (session.visited.has(normalizedCurrentUrl)) continue;
      session.visited.add(normalizedCurrentUrl);

      const crawlTask = crawlSPA(
        normalizedCurrentUrl,
        baseUrl,
        session,
        browser
      );

      if (session.queue.length === 0) {
        await crawlTask;
      }
      crawlPromises.push(crawlTask);

      if (crawlPromises.length >= concurrencyLimit) {
        await Promise.all(crawlPromises);
        crawlPromises = [];
      }
    }

    // Final wait
    await Promise.all(crawlPromises);
  })();

  // Timeout logic
  // const timeoutPromise = new Promise((_, reject) => {
  //   setTimeout(() => {
  //     reject(
  //       new Error(`Crawling timed out after ${timeLimitSeconds} seconds.`)
  //     );
  //   }, timeLimitSeconds * 1000);
  // });

  try {
    await Promise.race([crawlController]);
  } catch (err) {
    console.error("Crawl interrupted:", (err as Error).message);
  } finally {
    await browser.close();
  }

  return {
    token: session.token,
    totalLinks: session.allLinks.size,
    links: [...session.allLinks],
    remainingQueue: session.queue.length,
  };
}
