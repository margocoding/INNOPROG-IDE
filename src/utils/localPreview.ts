/** Only explicitly started development previews can bypass platform bootstrap. */
export const LOCAL_PREVIEW = process.env.IDE_LOCAL_PREVIEW === '1';
