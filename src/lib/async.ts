import { reportDevError } from './errors';

type DetachedErrorHandler = (error: unknown) => void;

export const runDetached = (
  promise: Promise<unknown>,
  scope: string,
  onError?: DetachedErrorHandler,
): void => {
  promise.catch((error) => {
    reportDevError(scope, error);

    if (!onError) return;

    try {
      onError(error);
    } catch (handlerError) {
      reportDevError(`${scope}.handler`, handlerError);
    }
  });
};
