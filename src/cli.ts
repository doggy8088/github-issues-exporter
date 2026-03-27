import { run } from "./index";

run(process.argv).then((code) => {
  process.exit(code);
}).catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
