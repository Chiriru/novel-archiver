import { Parser, wrapChapter, wrapOnlineNovelMetadata } from "../entities";
import c, { CheerioAPI } from "cheerio";
import axios from "axios";
import prettify from "pretty";
import { createSectionHtml } from "../epub-maker/app";

type NovelHiddenMetadata = {
  novel_id: number,
  novel_name: string,
  novel_alternatives: string,
  novel_image: string,
  novel_description: string,
  novel_score: number,
  novel_status: string,
  novel_slug: string,
  created_at: string,
  updated_at: string
}
type ChapterHiddenMetadata = {
  chapter_id: number,
  chapter_name: string,
  chapter_index: number,
  chapter_slug: string,
  novel_id: number,
  site_id: number,
  chapter_source_id: number,
  novel_source_id: string,
  content: string,
  novel: {
    novel_id: number,
    novel_name: string,
    novel_slug: string,
    novel_image: string,
    genre_name: string,
    genre_slug: string
  }
}
type Chapter = {
  id: number,
  chapter_name: string,
  chapter_index: number,
  slug: string,
  updated_at: string
}
const NEXT_METADATA_SELECTOR = "script#__NEXT_DATA__"

const ACCEPTED_HOSTS = [
  "lightnovels.me",
  "www.lightnovels.me",
  "pandapama.com",
];
const ACCEPTED_PATHNAMES = [
  "/novel",
  "/read"
];

const getNovelHiddenMetadata = (body: CheerioAPI) => JSON.parse(body(NEXT_METADATA_SELECTOR).text()).props?.pageProps?.novelInfo as NovelHiddenMetadata;
const getChapterHiddenMetadata = (body: CheerioAPI) => JSON.parse(body(NEXT_METADATA_SELECTOR).text()).props?.pageProps?.cachedChapterInfo as ChapterHiddenMetadata
// I hate this wholehartedly, but its the only way i found to convert html's <br> into xhtml's <br/>
const cleanChapterContent = (chapterContent: string) => c.load(chapterContent, {}, false).xml();

const IMAGE_HOST = "https://lightnovels.me";
const getImageUrl = (imagePath: string) => `${IMAGE_HOST}${imagePath}`;
const CHAPTER_LIST_HOST = "https://lightnovels.me/api/chapters"
const getChapterListUrl = (novelId: string, index: number = 1, limit: number = 15000) => `${CHAPTER_LIST_HOST}?id=${novelId}&index=${index}&limit=${limit}`;
const CHAPTER_HOST = "https://pandapama.com/read";
const getChapterUrl = (chapterPath: string) => `${CHAPTER_HOST}${chapterPath}`;

export const parser: Parser = {
  parseNovelMetadata: async (html: string) => {
    const body = c.load(html);

    const hiddenMetadata = getNovelHiddenMetadata(body);
    const title = hiddenMetadata.novel_name
    const coverImage = Buffer.from((await axios.get(getImageUrl(hiddenMetadata.novel_image), { responseType: "arraybuffer" })).data);
  
    const chapterListUrl = getChapterListUrl(hiddenMetadata.novel_id.toString());
    const chapters = (await axios.get(chapterListUrl, { responseType: "json" })).data.results as Chapter[];
    const chapterList = chapters.map((el) => getChapterUrl(el.slug));

    if (!chapterList) throw new Error("No chapters found")
  
    return wrapOnlineNovelMetadata(title, coverImage, chapterList);
  },
  parseChapter: (html: string, pretty: boolean = true) => {

    const body = c.load(html);
    // alternate way, chose converting the whole body because i still have to get the title
    // const test = c.load(response);
    // console.log(c.load(test(CONTENT_SELECTOR).html() || "", {}, false).xml())
    const hiddenMetadata = getChapterHiddenMetadata(body);
  
    const chapter_title = hiddenMetadata.chapter_name;
    const content = cleanChapterContent(hiddenMetadata.content) || "";

    const data = createSectionHtml(chapter_title, content);
    const filename = `${chapter_title}.xhtml`;
  
    return wrapChapter(filename, chapter_title, pretty ? prettify(data) : data);
  },
  validateUrl: ({ hostname, pathname }: URL) => {
    return ACCEPTED_HOSTS.includes(hostname) && ACCEPTED_PATHNAMES.some(allowedPath => pathname.startsWith(allowedPath.toLowerCase()));
  }
}

