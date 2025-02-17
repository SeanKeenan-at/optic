import { Octokit } from '@octokit/rest';
import { trackEvent } from './segment';
import { findOpticCommentId } from './shared-comment';
import { CompareFileJson, UploadJson } from '../ci-types';
import { createCommentBody } from './compare-comment';

export const publishGithubMessage = async (
  octokit: Octokit,
  body: string,
  hash: string,
  owner: string,
  repo: string,
  pull_number: number,
  handleError: (e: any) => void
) => {
  try {
    const { data: requestedReviewers } =
      await octokit.pulls.listRequestedReviewers({
        owner,
        repo,
        pull_number,
      });

    trackEvent(
      'optic_ci.github_comment',
      {
        owner,
        repo,
        pull_number,
        number_of_reviewers:
          requestedReviewers.users.length + requestedReviewers.teams.length,
        org_repo_pr: `${owner}/${repo}/${pull_number}`,
      },
      `${owner}-optic-ci`
    );
  } catch (e) {
    return handleError(e);
  }

  // Given we don't have the comment id; we need to fetch all comments on a PR.
  // We don't want to spam the comments, we want to update to the latest
  let maybeOpticCommentId: number | null;
  try {
    maybeOpticCommentId = await findOpticCommentId(
      octokit,
      hash,
      owner,
      repo,
      pull_number
    );
  } catch (e) {
    return handleError(e);
  }
  try {
    if (maybeOpticCommentId) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: maybeOpticCommentId,
        body,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pull_number,
        body,
      });
    }
  } catch (e) {
    return handleError(e);
  }
};

export const sendGithubMessage = async (
  octokit: Octokit,
  compareHash: string,
  {
    compareOutput,
    uploadOutput,
  }: {
    compareOutput: CompareFileJson;
    uploadOutput: UploadJson;
  },
  handleError: (e: any) => void
) => {
  const { results, changes } = compareOutput;
  const { opticWebUrl, ciContext } = uploadOutput;
  const {
    organization: owner,
    repo,
    pull_request: pull_number,
    commit_hash,
    run,
  } = ciContext;
  const body = createCommentBody(
    results,
    changes,
    compareHash,
    commit_hash,
    run,
    opticWebUrl
  );
  await publishGithubMessage(
    octokit,
    body,
    compareHash,
    owner,
    repo,
    pull_number,
    handleError
  );
};
