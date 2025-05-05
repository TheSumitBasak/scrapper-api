import { CrawlerSessionState } from "@/types/crawlerSession";
import { Request, Response } from "express";
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
    console.log(`Crawling ${currentUrl}`);
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
        .filter((link) => !!link && link);
    });

    if (session.crawling) session.crawling.delete(currentUrl);

    links.forEach((link) => {
      try {
        const absoluteUrl = new URL(link, baseUrl).href;
        if (new URL(absoluteUrl).hostname != new URL(baseUrl).hostname) return;
        // Normalize the URL to avoid duplicates
        const normalizedUrl = normalizeUrl(absoluteUrl);

        if (
          normalizedUrl.startsWith(baseUrl) &&
          !session.visited.has(normalizedUrl) &&
          !session.queue.includes(normalizedUrl) &&
          !session?.crawling?.has?.(normalizedUrl)
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
  timeLimitSeconds = 30,
  concurrencyLimit = 5
) {
  const browser = await puppeteer.launch({ headless: true });

  const crawlController = (async () => {
    let crawlPromises: Promise<void>[] = [];

    while (session.queue.length > 0) {
      const currentUrl = session.queue.shift();
      if (!currentUrl) continue;

      const normalizedCurrentUrl = normalizeUrl(currentUrl);
      if (
        session.visited.has(normalizedCurrentUrl) ||
        session?.crawling?.has?.(normalizedCurrentUrl)
      )
        continue;
      session.visited.add(normalizedCurrentUrl);
      if (session.crawling) session.crawling.add(normalizedCurrentUrl);
      else session.crawling = new Set([normalizedCurrentUrl]);

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
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(`Crawling timed out after ${timeLimitSeconds} seconds.`)
      );
    }, timeLimitSeconds * 1000);
  });

  try {
    await Promise.race([crawlController, timeoutPromise]);
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
    session: session,
  };
}

async function getSPAData(
  url: string,
  browser: Browser,
  res: Response,
  isCanceled: () => boolean // <-- added this!
) {
  if (isCanceled()) {
    console.log(`Skipped ${url} because crawl was canceled.`);
    return;
  }

  const page = await browser.newPage();

  try {
    if (isCanceled()) {
      console.log(`Aborting before navigation for ${url}`);
      await page.close();
      return;
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (isCanceled()) {
      console.log(`Aborting after navigation for ${url}`);
      await page.close();
      return;
    }

    // Optionally wait a bit (small delay) if you need AJAX to populate links
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (isCanceled()) {
      console.log(`Aborting before evaluation for ${url}`);
      await page.close();
      return;
    }

    const data = await page.evaluate(() => {
      Array.from(document.querySelectorAll("link[rel='stylesheet']")).forEach(
        (el) => el.remove()
      );
      return document.body.textContent;
    });

    if (isCanceled()) {
      console.log(`Aborting after evaluation for ${url}`);
      await page.close();
      return;
    }

    res.write(JSON.stringify({ url: url, data: data }));
  } catch (err) {
    console.error("Error fetching SPA data:", (err as Error).message);
  } finally {
    await page.close();
  }
}

export async function getUrlsData(
  req: Request,
  res: Response,
  urls: string[],
  concurrencyLimit = 5
) {
  const browser = await puppeteer.launch({ headless: true });

  let crwalPromises: Promise<void>[] = [];
  let canceled = false;

  const isCanceled = () => canceled;

  try {
    const crawlController = (async () => {
      while (urls.length > 0 && !isCanceled()) {
        const currentUrl = urls.shift();
        if (!currentUrl) continue;
        console.log(`Scrapping ${currentUrl}...`);

        const normalizedCurrentUrl = normalizeUrl(currentUrl);
        const crawlTask = getSPAData(
          normalizedCurrentUrl,
          browser,
          res,
          isCanceled // <-- pass the cancel checker
        );

        crwalPromises.push(crawlTask);

        if (crwalPromises.length >= concurrencyLimit) {
          await Promise.all(crwalPromises);
          crwalPromises = [];
        }
      }
      await Promise.all(crwalPromises);
    })();

    req.on("close", () => {
      console.log("Client disconnected, aborting crawl.");
      canceled = true; // Set the cancel flag ✅
      browser.close(); // Close browser ASAP
      res.end();
    });

    
    res.on("close", () => {
      console.log("Client disconnected, aborting crawl.");
      canceled = true; // Set the cancel flag ✅
      browser.close(); // Close browser ASAP
      res.end();
    });

    await crawlController;
    res.end();
  } catch (err) {
    console.error("Error during URL data fetching:", (err as Error).message);
  } finally {
    await browser.close();
  }
}

