import axios from "axios";
import c from "cheerio";
import validate from "validator";
import prettify from "pretty";
import { OnlineNovelMetadata, wrapOnlineNovelMetadata, wrapChapter } from "./entities";
import { createSectionHtml, createEpub, wrapSection, wrapContent, wrapImage, wrapCover, wrapEpub, writeEpub } from "./epub-maker/app";
import { FsRepository } from "./repository";

const ACCEPTED_PAGES = [
  "www.readlightnovel.me",
  "readlightnovel.me",
  "www.readlightnovel.com",
  "readlightnovel.com"
]
// THis selector should be able to get all the <a> elements with an "href" attribute that link to every chapter's page
const CHAPTER_LIST_SELECTOR = ".tab-content div ul li a";
const CONTENT_SELECTOR = "div.desc #chapterhidden";
const INDEX_TITLE_SELECTOR = "div.block-title h1";
// Extracts it from the breadcrumbs shown at the top of the page
const CHAPTER_TITLE_SELECTOR = ".breadcrumb-item.active";
const NOVEL_IMG_SELECTOR = ".novel-cover a img";

const validateNovelUrl = (novelUrl: string) => validate.isURL(novelUrl, { host_whitelist: ACCEPTED_PAGES });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (text: string, shouldLog: boolean = true) => {

  if (shouldLog) console.log(text);
}

const getChapter = async (link: string, pretty: boolean = true) => {

  const response = (await axios.get(link)).data;
  const body = c.load(response);
  // alternate way, chose converting the whole body because i still have to get the title
  // const test = c.load(response);
  // console.log(c.load(test(CONTENT_SELECTOR).html() || "", {}, false).xml())
  const cleanBody = c.load(body.xml(), { xmlMode: true });
  // Chapter number Ex: Chapter 12
  const chapter_title = cleanBody(CHAPTER_TITLE_SELECTOR).text();

  // I have to reparse the whole thing to be able to convert HTML's <br> into XHTML's <br/>..... this is so fucking dumb
  const content = cleanBody(CONTENT_SELECTOR).html() || "";
  const data = createSectionHtml(chapter_title, content);
  const filename = `${chapter_title}.xhtml`;

  return wrapChapter(filename, chapter_title, pretty ? prettify(data) : data);
}
export const getNovelMetadata = async (novelIndexUrl: string) => {
  if (!validateNovelUrl(novelIndexUrl)) throw new Error("Invalid novel Url. Use an url that points to the index page of a novel in readlightnovel.me");

  const response = await axios.get(novelIndexUrl);
  const body = c.load(response.data);

  const title = body(INDEX_TITLE_SELECTOR).text();
  const coverImageUrl = body(NOVEL_IMG_SELECTOR).attr("src") || "";
  const coverImage = Buffer.from((await axios.get(coverImageUrl, { responseType: "arraybuffer" })).data);

  const chapterList = body(CHAPTER_LIST_SELECTOR).get().map(el => body(el).attr("href") || "").filter(el => el);
  if (!chapterList) throw new Error("No chapters found")

  return wrapOnlineNovelMetadata(title, coverImage, chapterList);
}

export const archiveChapters = async ({ title, chapterLinks }: OnlineNovelMetadata, delay: number = 1000, logging: boolean = true) => {

  log(`Archiving ${title}'s ${chapterLinks.length} chapters`, logging);
  const indexChapterPairs: [number, string][] = chapterLinks.map((value, index) => [index, value]);
  for (const [index, link] of indexChapterPairs) {
    const chapter = await getChapter(link);
    FsRepository.saveChapter(title, chapter);
    log(`Archived ${chapter.filename} (${index + 1}/${indexChapterPairs.length})`, logging)

    // I wait between request to make sure i dont get ip banned for spamming requests,
    // or i guest a Too Many Requests response (400 something..)
    await wait(delay);
  }
}

export const archiveNovel = async (novelIndexUrl: string, logging: boolean = true) => {
  const metadata = await getNovelMetadata(novelIndexUrl);

  FsRepository.createNovel(metadata, true);
  await archiveChapters(metadata, undefined, logging);
  return metadata.title;
}
export const convertNovelToEpub = (novelTitle: string, author: string = "vVanish") => {
  const novel = FsRepository.loadArchivedNovel(novelTitle);

  const streams = novel.chapters;
  const sections = streams.map(({ filename, title, data }) => wrapSection(filename, title, data));
  const content = wrapContent(sections);
  
  const tocElements = streams.map(({ filename, title }) => `<a href="./${filename}">${title}</a>`)
  const tocContent = createSectionHtml("Table of Contents", tocElements.join());
  const toc = wrapSection("toc.xhtml", "Table of Contents", tocContent);
  
  const img = wrapImage("cover.png", novel.cover, "image/png");
  const coverPage = wrapSection("Cover.xhtml", "Cover", createSectionHtml("Cover", '<img src="../images/cover.png">'))
  const cover = wrapCover(img, coverPage);
  
  const epub = wrapEpub(novelTitle, author, content, toc, cover);
  const file = createEpub(epub).generateNodeStream({ type: "nodebuffer" });

  return FsRepository.saveFile(novelTitle, `${novelTitle}.epub`, file)
}


// const url = "https://www.readlightnovel.me/i-am-the-last-villainess-he-has-to-kill";

// getNovelMetadata(url).then(meta => {
//   archiveNovel(url)
//   .then(() => convertNovelToEpub(meta.title));
// })