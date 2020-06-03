import { FileAction } from './FileAction';

export interface FileActionResult {
  action: FileAction;
  start: number;
  finish: number;
  didTimeout: boolean;
}