import path from 'node:path';

const testsFolder = path.resolve(__dirname, '..');

let testFile: string | undefined;
const testFileRegex = /\.test\.(js|tsx?)/;

const visitedModules = new Set<NodeJS.Module>();
const checkParent = (mod: NodeJS.Module | undefined) => {
  if (!mod?.parent || visitedModules.has(mod)) return;
  testFile = mod.parent.filename || '';
  visitedModules.add(mod);

  if (!testFileRegex.test(testFile)) {
    checkParent(mod.parent);
  }
};
checkParent(module);

const testFolderModes = ['development', 'production'];
const currentTestFile = testFile;

const testModeFromFile = currentTestFile
  ? testFolderModes.find((mode) =>
      currentTestFile.startsWith(path.join(testsFolder, mode)),
    )
  : undefined;

if (testModeFromFile === 'development') {
  process.env.TEST_MODE = 'dev';
} else if (testModeFromFile === 'production') {
  process.env.TEST_MODE = 'start';
}
