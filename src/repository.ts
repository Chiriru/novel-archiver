import sanitize from "sanitize-filename";
import { readFileSync, readdirSync, existsSync, rmSync, rmdirSync, writeFileSync, writeFile, createReadStream, createWriteStream, mkdirSync } from "fs";
import { resolve } from "path";
import { NovelRepository, wrapNovel, wrapNovelMetadata, wrapChapter, OnlineNovelMetadata } from "./entities";

const NOVEL_STORAGE_PATH = resolve(__dirname, "./novels/");
const METADATA_FILENAME = "meta.json";
const COVER_IMAGE_FILENAME = "cover.png";

if (!existsSync(NOVEL_STORAGE_PATH)) mkdirSync(NOVEL_STORAGE_PATH);

const novelPath = (novelTitle: string) => resolve(NOVEL_STORAGE_PATH, sanitize(novelTitle));
const novelFile = (novelTitle: string, filename: string) => resolve(novelPath(novelTitle), sanitize(filename));
const novelIsArchived = (novelTitle: string) => existsSync(novelPath(novelTitle));
const novelHasFile = (novelTitle: string, filename: string) => existsSync(novelFile(novelTitle, filename));


export const FsRepository: NovelRepository = {
  loadArchivedNovel: function (novelTitle) {
    if (!novelIsArchived(novelTitle))
      throw new Error("Novel is not archived");

    const meta = this.loadArchivedMetadata(novelTitle);
    const chapters = this.loadArchivedChapters(novelTitle, meta.archivedChapters);
    const cover = this.loadArchivedCover(novelTitle)

    return wrapNovel(meta, chapters, cover);
  },
  loadArchivedCover: function (novelTitle: string): Buffer {
    if (!novelIsArchived(novelTitle)) throw new Error("Novel is not archived");
    if (!novelHasFile(novelTitle, COVER_IMAGE_FILENAME)) throw new Error("Novel doesnt have a cover");

    const meta = this.loadArchivedMetadata(novelTitle);
    const img = readFileSync(novelFile(novelTitle, meta.coverImageFilename))

    return img;
  },
  loadArchivedMetadata: function (novelTitle) {
    if (!novelIsArchived(novelTitle))
      throw new Error("Novel is not archived");
    if (!novelHasFile(novelTitle, METADATA_FILENAME))
      throw new Error("Novel doesnt have metadata");

    const data = JSON.parse(readFileSync(novelFile(novelTitle, METADATA_FILENAME), "utf-8"));

    return data;
  },
  loadArchivedChapters: function (novelTitle, archivedChapters) {
    if (!novelIsArchived(novelTitle))
      throw new Error("Novel is not archived");
    if (!archivedChapters)
      return [];

    // First get read of the files that are not actually on the folder, and then read the ones that actually are there
    const chapterStreams = Object.entries(archivedChapters)
      .filter(([title, filename]) => novelHasFile(novelTitle, filename))
      .map(([title, filename]) => {
        const path = novelFile(novelTitle, filename);
        const data = createReadStream(path);
        return wrapChapter(filename, title, data);
      });

    return chapterStreams;
  },
  saveFile: function (novelTitle, filename, data) {
    return new Promise((resolve, reject) => {

      if (!novelIsArchived(novelTitle)) reject("Novel is not archived");

      if (typeof (data as NodeJS.ReadableStream).pipe === "function") {
        const out = createWriteStream(novelFile(novelTitle, filename));
        (data as NodeJS.ReadableStream)
          .pipe(out)
          .on("finish", resolve)
          .on("error", reject);
        return;
      }
  
      writeFile(novelFile(novelTitle, filename), data as string | NodeJS.ArrayBufferView, (err) => err ? reject(err) : resolve());
    });
  },
  saveChapter: function (novelTitle, chapter) {
    this.saveFile(novelTitle, chapter.filename, chapter.data);

    // Updates the archived chapters in the novel's metadata
    const metadata = this.loadArchivedMetadata(novelTitle);
    metadata.archivedChapters[chapter.title] = chapter.filename;
    this.saveMetadata(novelTitle, metadata);
  },
  saveMetadata: function (novelTitle, metadata) {
    const json = JSON.stringify(metadata);
    this.saveFile(novelTitle, METADATA_FILENAME, json);
  },
  createNovel: function ({ title, chapterLinks, cover }: OnlineNovelMetadata, deleteExisting: boolean = false) {
    if (novelIsArchived(title)) {
      if (!deleteExisting)
        throw new Error("Novel is already archived");

      this.deleteNovel(title);
    }

    mkdirSync(novelPath(title));
    writeFileSync(novelFile(title, COVER_IMAGE_FILENAME), cover);
    const metaJson = JSON.stringify(wrapNovelMetadata(COVER_IMAGE_FILENAME, {}, chapterLinks));
    writeFileSync(novelFile(title, METADATA_FILENAME), metaJson);
  },
  deleteNovel: function (novelTitle) {
    if (!novelIsArchived(novelTitle))
      throw new Error("Novel is not archived");

    const files = readdirSync(novelPath(novelTitle));
    files.forEach(filename => rmSync(novelFile(novelTitle, filename)));
    rmdirSync(novelPath(novelTitle));
  },
}
