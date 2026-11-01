import { handleTelegram } from '../../server/telegram.js';

export default request => handleTelegram(request, process.env);
export const config = { path: '/api/telegram' };
