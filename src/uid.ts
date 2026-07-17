let counter = 0;
export const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;
