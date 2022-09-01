import axios from "axios";
import { parsers } from "./parsers";
import { OnlineNovelMetadata } from "./entities";
import { createSectionHtml, createEpub, wrapSection, wrapContent, wrapImage, wrapCover, wrapEpub } from "./epub-maker/app";
import { FsRepository } from "./repository";

const validateNovelUrl = (novelUrl: string) => {
  try {
    new URL(novelUrl);
    return true;
  } catch (err) {
    return false;
  }
};
const getParserFromUrl = (novelUrl: string) => {
  if (!validateNovelUrl(novelUrl)) return undefined;

  const parsedUrl = new URL(novelUrl);
  return parsers.find((parser) => parser.validateUrl(parsedUrl));
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (text: string, shouldLog: boolean = true) => {

  if (shouldLog) console.log(text);
}

const getChapter = async (link: string, pretty: boolean = true) => {

  const parser = getParserFromUrl(link);
  if (!parser) throw new Error("Invalid URL");

  const response = (await axios.get(link)).data;
  return parser.parseChapter(response, pretty);
}
export const getNovelMetadata = async (novelIndexUrl: string) => {
  const parser = getParserFromUrl(novelIndexUrl);
  if (!parser) throw new Error("Invalid novel URL");

  const response = await axios.get(novelIndexUrl);
  return parser.parseNovelMetadata(response.data);
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


// getNovelMetadata(url).then(meta => {
//   archiveNovel(url)
//   .then(() => convertNovelToEpub(meta.title));
// })