import { default as JSZip } from "jszip";
import fs from "fs";
import c from "cheerio";
import { resolve } from "path";


type ContentType = string | NodeJS.ReadableStream;
type ImageDataType = Buffer | NodeJS.ReadableStream;

interface Section {
  filename: string,
  title: string,
  content: ContentType,
  stylePath?: string
}
interface Image {
  filename: string,
  data: ImageDataType,
  // TODO define Image types ( would probably be MIME types )
  type: string,
}
interface Content {
  sections: Section[],
  style?: string,
  images?: Image[],
}
interface Cover {
  page: Section,
  image: Image
}
interface EpubOptions {
  title: string,
  author: string,
  cover: Cover,
  toc: Section,
  content: Content,
  navigation?: Record<string, string>
  rights?: string,
  language?: string,
  date?: string,
  description?: string,
  publisher?: string,
  subject?: string,
}

const getDefault = (path: string) => fs.readFileSync(resolve(__dirname, "./default", path));

const BASE_SECTION_XHTML = getDefault("section.xhtml");
const DEFAULT_STYLESHEET = getDefault("stylesheet.css");
const CONTAINER_XML = getDefault("container.xml");
const DEFAULT_COVER_IMG = getDefault("cover.jpg");

const PACKAGE_FILENAME = "package.opf";
const NAVIGATION_CONTROL_FILENAME = "toc.ncx"
const TEXT_FOLDER_PATH = "text/";
const STYLE_FOLDER_PATH = "styles/";
const IMAGE_FOLDER_PATH = "images/";
const COVER_IMG_ID = "cover-img";
const COVER_PAGE_ID = "cover-page"
const TOC_ID = "TableOContents"
const SECTION_ID_PREFIX = "sect-"
const SECTION_MEDIA_TYPE = "application/xhtml+xml"
const STYLESHEET_FILENAME = "stylesheet.css";

/**TODO, somehow make it so the spine, the manifest, and the file creation part of createEpubContainer all use
 * a single source of truth, like a function
 * The problem with using getTextElements is that it returns a Section[], and the cover page & the TOC
 * need special IDs and special attributes
 * 
 * What i could do is a function that converts them into Nodes, but then i wouldnt be able to use it to create
 * the files in createEpubContainer
 * Maybe then, 2 functions, one converts them into the Section[], and the 2nd one depends on the 1st one,
 * and maps the results into a string[] which will have the nodes
 * 
 * Or maybe make 1 function, and pass it a boolean which will decide if its a Section[] or string[]
 * z z z z z
 * 
 * The issue is algo preserving the extra properties, while using the default ones for normal sections
 */
/** TODO
 * Make a way to create the EPUB Options object???
 * An easy way i mean, instead of manually creating the object zzzzzz
 * Its simple to just make a function that just puts all the inputs in an object, but they're so many
 * fields...... the function becomes ugly quickly.....
 */
/**TODO
 * Work with streams and JSZip & fs, as to not load the whole EPUB in memory
 */


export const wrapImage = (filename: string, data: ImageDataType, type: string): Image => {
  return { filename, data, type };
}
export const wrapSection = (filename: string, title: string, content: ContentType): Section => {
  return { filename, content, title };
}
export const wrapCover = (image: Image, page: Section): Cover => {
  return { page, image } as Cover;
}
export const wrapContent = (sections: Section[], images?: Image[], style?: string): Content => {
  return { sections, images, style };
}
export const wrapEpub = (title: string, author: string, content: Content, toc: Section, cover: Cover = defaultCover()): EpubOptions => {
  return { title, author, cover, toc, content }
}
export const writeEpub = (path: string, options: EpubOptions): Promise<void> => {
  return new Promise((res, reject) => {
    const epub = createEpub(options);

    const stream = epub.generateNodeStream({ type: "nodebuffer", streamFiles: true });
    const outStream = fs.createWriteStream(path);

    stream.pipe(outStream)
    .on("finish", res)
    .on("error", reject);
  })
}
export const createEpub = (options: EpubOptions) => {

  // "/"
  const zip = new JSZip();
  const metaFolder = zip.folder("META-INF");
  const structureFolder = zip.folder("OEBPS");
  if (!metaFolder || ! structureFolder) throw new Error("Folders are null???");

  zip.file("mimetype", "application/epub+zip")

  // "meta/"
  metaFolder.file("container.xml", CONTAINER_XML);

  // "OEBPS/"
  const textFolder = structureFolder.folder(TEXT_FOLDER_PATH);
  const styleFolder = structureFolder.folder(STYLE_FOLDER_PATH);
  const imageFolder = structureFolder.folder(IMAGE_FOLDER_PATH);
  structureFolder.file(PACKAGE_FILENAME, createPackage(options))
  structureFolder.file(NAVIGATION_CONTROL_FILENAME, createNavigationControl(options));

  // "OEBPS/text"
  for (const section of getTextElements(options)) {
    textFolder?.file(section.filename, section.content);
  }
  // "OEBPS/images"
  for (const image of getImageElements(options)) {
    imageFolder?.file(image.filename, image.data);
  }

  styleFolder?.file(STYLESHEET_FILENAME, options.content.style || DEFAULT_STYLESHEET);

  return zip;
}

const createPackage = (epub: EpubOptions): string => {
  const { title, author, rights = "All rights reserved", language = "en", date, description, publisher, subject } = epub;

  const document = c.load("<package>", { xmlMode: true });
  const pkg = document("package");
  pkg.append("<metadata>", "<manifest>", "<spine>", "<guide>")
    .attr({
      xmlns: "http://www.idpf.org/2007/opf",
      prefix: "calibre: https://calibre-ebook.com ibooks: http://vocabulary.itunes.apple.com/rdf/ibooks/vocabulary-extensions-1.0/"
    });

  // Metadata
  const meta = pkg.children("metadata");
  meta.attr({
    "xmlns:dc": "http://purl.org/dc/elements/1.1/",
    "xmlns:opf": "http://www.idpf.org/2007/opf"
  });
  meta.append("<dc:title>", "<dc:creator>", "<dc:rights>", "<dc:language>", "<dc:date>", "<dc:description>", "<dc:publisher>", "<dc:subject>", "<meta>");
  meta.children("dc\\:title").append(title).attr({ id: `${language}-title`, "xml:lang": language });
  meta.children("dc\\:creator").append(author);
  meta.children("dc\\:rights").append(rights);
  meta.children("dc\\:language").append(language);
  meta.children("dc\\:date").append(date || "");
  meta.children("dc\\:description").append((description || ""));
  meta.children("dc\\:publisher").append(publisher || "");
  meta.children("dc\\:subject").append(subject || "");


  // Manifest
  const manifest = pkg.children("manifest");
  const manifestItems = getManifestItems(epub);
  manifest.append(...manifestItems);

  // Spine
  const spine = pkg.children("spine");
  const spineItems = getSpineItems(epub);
  spine.append(...spineItems);

  // Guide TODO

  return document.xml();
}

const createNavigationControl = (epub: EpubOptions): string => {
  const { author, title, navigation = defaultNavigation(epub) } = epub;

  const document = c.load("<ncx>", { xmlMode: true });
  const main = document("ncx");
  main.append("<head>", "<docTitle>", "<docAuthor>", "<navMap>");

  const head = main.children("head");
  main.children("docTitle").append(title);
  main.children("docAuthor").append(author);
  const navMap = main.children("navMap");

  // Convert key:value pairs into navigationPoints for the NavMap
  const nodes = Object.entries(navigation).map(([ title, path ], index) => {
    const node = c.load("<navPoint>", { xmlMode: true });
    const point = node("navPoint");
    point.attr({ id: `a${index + 1}`, playOrder: (index + 1).toString() });

    point.append("<navLabel>").children("navLabel")
      .append("<text>").children("text")
      .append(title);
    point.append("<content>").children("content").attr("src", path);

    return node.xml();
  })

  navMap.append(...nodes);
  
  return document.xml();
}
// When no Navigation is provided in EpubOptions' Content, a default navigation will be created with the Cover, TOC and every sections title and path
const defaultNavigation = (epub: EpubOptions) => {

  const navigation = getTextElements(epub).reduce((obj, cur) => {
    obj[cur.title] = `${TEXT_FOLDER_PATH}${cur.filename}`;
    return obj
  }, {} as Record <string, string>)

  return navigation;
}
const defaultCover = (): Cover => {
  const IMG_FILENAME = "cover.jpg";
  const DEFAULT_COVER_CONTENT = c.load("<img> </img>", { xmlMode: true });
  DEFAULT_COVER_CONTENT("img").attr("src", `../${IMAGE_FOLDER_PATH}${IMG_FILENAME}`);

  return { 
    image: wrapImage(IMG_FILENAME, DEFAULT_COVER_IMG, "image/jpeg"),
    page: wrapSection("Cover.xhtml", "Cover", DEFAULT_COVER_CONTENT.xml())
  }
}

const getTextElements = ({ content, cover, toc }: EpubOptions) => {

  const elements = [
    cover.page,
    toc,
    ...content.sections
  ];

  return elements;
}
const getTextNodes = (sections: Section[]) => {

}
const getImageElements = ({ content, cover }: EpubOptions) => {
  const elements = [
    cover.image,
    ...(content.images || [])
  ];

  return elements;
}

// Items that are the same every time, should probably change it to premade strings, so it doesnt use cpu time everytime
const getStaticManifestItems = ({ cover, toc }: EpubOptions): string[] => {

  const style = c.load("<item>", { xmlMode: true });
  style("item").attr({
    href: STYLE_FOLDER_PATH + "stylesheet.css",
    id: "stylesheet",
    "media-type": "text/css"
  });
  
  const navigationControl = c.load("<item>", { xmlMode: true });
  navigationControl("item").attr({
    href: NAVIGATION_CONTROL_FILENAME,
    id: "ncx",
    "media-type": "application/x-dtbncx+xml"
  });

  const tableOfContent = c.load("<item>", { xmlMode: true });
  tableOfContent("item").attr({
    href: `${TEXT_FOLDER_PATH}${toc.filename}`,
    id: TOC_ID,
    "media-type": SECTION_MEDIA_TYPE,
    properties: "nav"
  });

  const coverImg = c.load("<item>", { xmlMode: true });
  coverImg("item").attr({
    href: `${IMAGE_FOLDER_PATH}${cover.image.filename}`,
    id: COVER_IMG_ID,
    "media-type": cover.image.type,
    properties: "cover-image"
  })
  const coverPage = c.load("<item>", { xmlMode: true });
  coverPage("item").attr({
    href: `${TEXT_FOLDER_PATH}${cover.page.filename}`,
    id: COVER_PAGE_ID,
    "media-type": SECTION_MEDIA_TYPE
  });

  const items = [style.xml(), navigationControl.xml(), tableOfContent.xml(), coverPage.xml(), coverImg.xml()];

  return items;
}
const getManifestItems = (epub: EpubOptions): string[] => {

  const { content } = epub;

  const sectionNodes = content.sections.map((section, index) => {
    const node = c.load("<item>", { xmlMode: true });
    node("item").attr({
      // this may be prone to bugs, as it should be the same as the path in the Navigation .ncx file, but is being made separately
      href: `${TEXT_FOLDER_PATH}${section.filename}`,
      id: `${SECTION_ID_PREFIX}${index + 1}`,
      "media-type": SECTION_MEDIA_TYPE
    })

    return node.xml();
  });

  const imageNodes = (content.images || []).map((image, index) => {
    const node = c.load("<item>", { xmlMode: true });
    const item = node("item");

    item.attr({
      href: IMAGE_FOLDER_PATH + image.filename,
      id: `image-${index + 1}`,
      "media-type": image.type
    })

    return node.xml();
  });
  const specialItems = getStaticManifestItems(epub);

  const nodes = [...specialItems, ...sectionNodes, ...imageNodes];
  return nodes;
}
// This makes it so The epub starts on the cover, the next page is the Table of Content and then its the content sections, in order
const getSpineItems = (epub: EpubOptions): string[] => {
  const coverNode = c.load("<itemref>", { xmlMode: true });
  coverNode("itemref").attr("idref", COVER_PAGE_ID);

  const tocNode = c.load("<itemref>", { xmlMode: true });
  tocNode("itemref").attr("idref", TOC_ID);
  
  const sectionNodes = epub.content.sections.map((el, index) => {
    const node = c.load("<itemref>", { xmlMode: true });
    node("itemref").attr("idref", `${SECTION_ID_PREFIX}${index + 1}`)
    return node.xml();
  })
  const spineItems = [coverNode.xml(), tocNode.xml(), ...sectionNodes];

  return spineItems;
}

/** This used to be implicit, you passed in the content in the Section, and it converted
 * the sections content into the proper html structure, but it had to be removed from the processing
 * to support readable streams, now instead you are supposed to convert your file into the proper
 * structure with this function, write it to disk, then make a readable stream out of it, and pass
 * it to the epub maker.... I dont like it at all but it is what it is
 * 
 * Maybe separate Sections from another "base" type, that is then converted into the proper xhtml file?
 * and section is separate? Because right now createSectionHTML need a title, and its not dry at all
 */
// Maybe convert document -> section ( with correct data )
// Convert content into a .xhtml file with a valid structure
export const createSectionHtml = (title: string, content: string): string => {

  const node = c.load(BASE_SECTION_XHTML, { xmlMode: true });
  const html = node("html");

  const head = html.children("head");
  const body = html.children("body");
  
  head.children("title").append(title);
  head.children("link")
  .attr({
    rel: "stylesheet",
    type: "text/css",
    href: "../" + STYLE_FOLDER_PATH + STYLESHEET_FILENAME
  });

  body.append(content);

  return node.xml();
}


// const cover = wrapCover(
//   wrapImage("cover-img.jpg", fs.createReadStream("img.jpg"), "image/jpeg"),
//   wrapSection("cover.xhtml", "Cover", createSectionHtml("Cover", '<img src="../images/cover-img.jpg">'))
// );
// const toc = wrapSection("toc.xhtml", "Table of Contents desu", createSectionHtml("TOC", "<a href='../text/Chapter_1.xhtml'> Chapter 1 </a> <a href='../text/Chapter_2.xhtml'> Chapter 2 </a>"));
// const sections = [
//   wrapSection("Chapter_1.xhtml", "Chapter 1: CBT", createSectionHtml("Chapter 1: CBT", "<p> Cock and ball torture (CBT) is a sexual activity involving application of pain or constriction to the male genitals. This may involve directly painful activities, such as wax play, genital spanking, squeezing, ball-busting, genital flogging, urethral play, tickle torture, erotic electrostimulation or even kicking. </p>")),
//   wrapSection("Chapter_2.xhtml", "Chapter 2: Recipient", createSectionHtml("Chapter 2: Recipient", "<p> The recipient of such activities may receive direct physical pleasure via masochism, or emotional pleasure through erotic humiliation, or knowledge that the play is pleasing to a sadistic dominant. Many of these practices carry significant health risks. </p>")),
// ]
// const content = wrapContent(sections);

// const epub = wrapEpub("Cock and ball Torture", "vVanish", content, toc, cover);

// writeEpub("cokku.epub", epub);

