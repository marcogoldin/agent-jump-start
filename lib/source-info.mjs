// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export function makeLocalSourceInfo(sourcePathInput) {
  const absolutePath = resolve(sourcePathInput);
  let sourceType = "local-file";

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    sourceType = "local-directory";
  } else if (absolutePath.endsWith(".json")) {
    sourceType = "local-json";
  } else if (absolutePath.endsWith(".md")) {
    sourceType = "local-skill-md";
  }

  return {
    sourceType,
    provider: "local",
    source: sourcePathInput,
    resolvedFrom: absolutePath,
  };
}
