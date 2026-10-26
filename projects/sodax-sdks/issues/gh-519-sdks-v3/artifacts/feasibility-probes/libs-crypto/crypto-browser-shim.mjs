// Stand-in for the proposed browser build: Node's crypto replaced by functions that fail loudly.
const fail = (name) => () => { throw new Error(`node crypto.${name} was called in the browser build`); };
export const randomBytes = fail('randomBytes');
export const createHash = fail('createHash');
export const createHmac = fail('createHmac');
export default {};
