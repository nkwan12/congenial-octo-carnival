const core = require("@actions/core");
const github = require("@actions/github");
const { Client } = require("@notionhq/client");
const getUrls = require("get-urls");

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function extractGithubParams() {
  const pullRequest = github.context.payload.pull_request;

  const requiredPrefix = escapeRegExp(
    core.getInput("required-prefix", { required: false }) || ""
  );

  const requiredSuffix = escapeRegExp(
    core.getInput("required-suffix", { required: false }) || ""
  );

  const isDraft = github.context.payload.pull_request?.draft;
  const isMerged = github.context.payload.pull_request?.merged;
  const statusKey = isMerged
    ? "merged"
    : isDraft
    ? "draft"
    : github.context.payload.action;
  const status = core.getInput(statusKey, { required: false });

  const githubUrlProperty =
    core.getInput("github-url-property-name", { required: false }) ||
    "Github URL";

  const statusProperty =
    core.getInput("status-property-name", { required: false }) || "Status";

  return {
    metadata: {
      statusKey,
    },
    pullRequest: {
      body: pullRequest.body ?? "",
      href: pullRequest.html_url,
      status,
    },
    suffix: requiredSuffix,
    prefix: requiredPrefix,
    notionProperties: {
      githubUrl: githubUrlProperty,
      status: statusProperty,
    },
  };
}

const params = extractGithubParams();

const urls = new Array(
  getUrls(params.pullRequest.body, {
    stripHash: true,
    removeQueryParameters: true,
  })
).filter((url) => url?.match("notion.so"));

const apiKey = core.getInput("api_key");

if (!apiKey) {
  core.error("No Notion API key found!");
} else if (!!urls.length && !!params.pullRequest.status) {
  const notion = new Client({
    auth: apiKey,
  });

  urls.forEach((url) => {
    const notionUrlParts = url
      .match(URL_REGEX)
      .find((url) => url.match("notion.so"))
      .split("/");

    const taskName = notionUrlParts[notionUrlParts.length - 1];

    const taskParts = taskName.split("-");
    const pageId = taskParts[taskParts.length - 1];

    notion.pages
      .update({
        page_id: pageId,
        properties: {
          ...(params.pullRequest.status
            ? {
                [params.notionProperties.status]: {
                  name: params.pullRequest.status,
                },
              }
            : {}),
          [params.notionProperties.githubUrl]: params.pullRequest.href,
        },
      })
      .then(() => {
        core.info(
          `Updated notion task to ${params.notionProperties.status} with id: ${pageId}`
        );
      })
      .catch((err) => {
        core.setFailed(err);
      });
  });
} else if (!!urls.length) {
  core.info("Notion tasks found, but no matching status found in params");
} else {
  core.info("No notion task(s) found in the PR body.");
}
