import c from "cheerio";
import axios from "axios";
import prettify from "pretty";
// Maybe make all Parsers give a <<neutral>> data, and then convert it to the epub version
// Because right now, im converting all chapters into XHTML with the epub-maker function
// but maybe i should make the archival neutral, and save it as pure HTML, and then when i want
// to convert it into an epub i convert the files to .xhtml, the issue would then be working with streams
// i would maybe need to create a temporary directory for the archived novel currently being converted,
// where i will put the .xhtml files during conversions, and later create ReadStreams from
import { createSectionHtml } from "../epub-maker/app";
import { Parser, wrapChapter, wrapOnlineNovelMetadata } from "../entities";


const ACCEPTED_HOSTS = [
  "www.readlightnovel.me",
  "readlightnovel.me",
  "www.readlightnovel.com",
  "readlightnovel.com"
]
const BLOCKED_PATHNAMES = [
  "/hub",
  "/novel-list",
  "/genre",
  "/latest-updates",
  "/top-novels",
  "/detailed-search",
]

// THis selector should be able to get all the <a> elements with an "href" attribute that link to every chapter's page
const CHAPTER_LIST_SELECTOR = ".tab-content div ul li a";
const CONTENT_SELECTOR = "div.desc #chapterhidden";
const INDEX_TITLE_SELECTOR = "div.block-title h1";
// Extracts it from the breadcrumbs shown at the top of the page
const CHAPTER_TITLE_SELECTOR = ".breadcrumb-item.active";
const NOVEL_IMG_SELECTOR = ".novel-cover a img";

const parser: Parser = {
  parseNovelMetadata: async (html: string) => {
    const body = c.load(html);
  
    const title = body(INDEX_TITLE_SELECTOR).text();
    const coverImageUrl = body(NOVEL_IMG_SELECTOR).attr("src") || "";
    const coverImage = Buffer.from((await axios.get(coverImageUrl, { responseType: "arraybuffer" })).data);
  
    const chapterList = body(CHAPTER_LIST_SELECTOR).get().map(el => body(el).attr("href") || "").filter(el => el);
    if (!chapterList) throw new Error("No chapters found")
  
    return wrapOnlineNovelMetadata(title, coverImage, chapterList);
  },
  parseChapter: (html: string, pretty: boolean = true) => {

    const body = c.load(html);
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
  },
  validateUrl: ({ hostname, pathname }: URL) => {
    return ACCEPTED_HOSTS.includes(hostname) && !BLOCKED_PATHNAMES.some(blockedPath => pathname.startsWith(blockedPath.toLowerCase()));
  }
}
export default parser;
