import { archiveNovel, convertNovelToEpub } from "./features";
import prompt from "prompt";
/**
 * This is pretty scuffed
 * 
 * TODO make a proper Command Line Interface with terminal kit, and maybe the Dialogue class i created
 * in an earlier project, as to use a menu that lets the user see the archived novels titles, pick one
 * to convert into epub, add new ones, or delete archived novels, and maybe update them
 */

const getPrompt = <T extends string>(values: T[]): Promise<Record<T, string>> => {
  return new Promise((resolve, reject) => prompt.get(values, (err, result) => {
    if (err) reject(err);
    resolve(result as Record<T, string>);
  }))
}


async function mainLoop() {
  let running = true;

  while (running) {
    console.log("Enter link to thatnovelcorner.me novel page");
    const link = (await getPrompt(["Link"])).Link;
    console.log();

    if (link.toLowerCase() === "exit") {
      running = false;
      continue;
    }

    try {
      const novelTitle = await archiveNovel(link);
      console.log("Would you like to convert the archived novel into an epub?");
      const choice = (await getPrompt(["y / n"]))["y / n"].toLowerCase() === "y";
      if (!choice) continue;

      console.log(`\nConverting ${novelTitle} to epub`);
      await convertNovelToEpub(novelTitle);
    } catch (err) {
      console.log(err);
      console.log();
    }
  }
}

mainLoop();