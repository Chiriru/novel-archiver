
import { ReadStream } from "fs";

export interface Chapter<T extends string | ReadStream> {
  filename: string,
  title: string,
  data: T
}
export interface OnlineNovelMetadata {
  title: string,
  cover: Buffer,
  chapterLinks: string[]
}
type archivedChapters = { [title: string]: string };
export interface NovelMetadata {
  coverImageFilename: string,
  archivedChapters: archivedChapters,
  chapterLinks: string[]
}
export interface Novel<T extends string | ReadStream> {
  meta: NovelMetadata,
  chapters: Chapter<T>[],
  cover: Buffer
}
export interface Parser {
  // Its a promise because it has to get the novel's cover image separately
  parseNovelMetadata: (html: string) => Promise<OnlineNovelMetadata>
  parseChapter: (html: string, pretty?: boolean) => Chapter<string>,
  validateUrl: (maybeUrl: URL) => boolean
}

// A dream... too good to be true....
// const wrap = <T extends object>(...obj: [T[keyof T]]) => { ...obj };
export const wrap = <T>(any: T) => any;
export const wrapChapter = <T extends string | ReadStream>(filename: string, title: string, data: T): Chapter<T> => ({ filename, title, data });
export const wrapNovelMetadata = (coverImageFilename: string, archivedChapters: { [title: string] : string}, chapterLinks: string[]): NovelMetadata => ({ coverImageFilename, archivedChapters, chapterLinks});
export const wrapOnlineNovelMetadata = (title: string, cover: Buffer, chapterLinks: string[]): OnlineNovelMetadata => ({ title, cover, chapterLinks });
export const wrapNovel = (meta: NovelMetadata, chapters: Chapter<ReadStream>[], cover: Buffer): Novel<ReadStream> => ({ meta, chapters, cover });

export interface NovelRepository {
  loadArchivedNovel(novelTitle: string): Novel<ReadStream>,
  loadArchivedCover(novelTitlte: string): Buffer,
  loadArchivedMetadata(novelTitle: string): NovelMetadata,
  loadArchivedChapters(novelTitle: string, archivedChapters: archivedChapters): Chapter<ReadStream>[],
  saveFile(novelTitle: string, filename: string, data: string | NodeJS.ArrayBufferView | NodeJS.ReadableStream ): Promise<void>,
  saveChapter(novelTitle: string, chapter: Chapter<string>): void,
  saveMetadata(novelTitle: string, metadata: NovelMetadata): void,
  createNovel(metadata: OnlineNovelMetadata, deleteExisting?: boolean): void,
  deleteNovel(novelTitle: string): void
}
