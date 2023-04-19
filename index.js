import * as core from "@actions/core";
import * as github from "@actions/github";
import { Client } from "@notionhq/client";
import getUrls from "get-urls";

const NOTION_ID_REGEXP = /-([a-zA-Z0-9]+)\/?$/;

const notionStatusProp =
  core.getInput("notion-status-prop", { required: false }) || "Status";
const notionGithubURLProp =
  core.getInput("notion-github-url-prop", { required: false }) || "Github URL";
const isDraft = github.context.payload.pull_request?.draft;
const isMerged = github.context.payload.pull_request?.merged;
const statusKey = isMerged
  ? "merged"
  : isDraft
  ? "draft"
  : github.context.payload.action;

const pullRequest = github.context.payload.pull_request;
const pullRequestStatus = core.getInput(statusKey, { required: false });
const pullRequestURL = pullRequest.html_url;

const urls = Array.from(
  getUrls(pullRequest.body || "", {
    stripHash: true,
    removeQueryParameters: true,
  })
).filter((url) => url?.match("notion.so"));
core.info(`Found notion urls: ${urls.join(", ")}`);

const apiKey = core.getInput("api_key");

if (!apiKey) {
  core.error("No Notion API key found!");
} else if (!!urls.length) {
  const notion = new Client({
    auth: apiKey,
  });

  urls.forEach((url) => {
    const urlMatch = url.match(NOTION_ID_REGEXP);
    const pageId = urlMatch[urlMatch.length - 1];

    notion.pages
      .update({
        page_id: pageId,
        properties: {
          ...(pullRequestStatus
            ? {
                [notionStatusProp]: {
                  name: pullRequestStatus,
                },
              }
            : {}),
          [notionGithubURLProp]: pullRequestURL,
        },
      })
      .then(() => {
        if (!pullRequestStatus) {
          core.info(
            `Updating task with id: ${pageId}. Updated property ${notionGithubURLProp}. No matching notion status found for action: ${statusKey}`
          );
        } else {
          core.info(
            `Updating task with id: ${pageId}. Updated property ${notionGithubURLProp}. Updated property ${notionStatusProp} to status: '${pullRequestStatus}'.`
          );
        }
      })
      .catch((err) => {
        core.setFailed(err);
      });
  });
} else if (!!urls.length) {
  core.info("Notion tasks found, but no matching status found in params");
} else {
  core.info("No notion task links found in PR");
}
