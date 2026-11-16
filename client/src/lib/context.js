import { createContext, useContext } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export const STATUS_LABEL = { new: '新学', review: '待复习', mastered: '已掌握' };
export const STATUS_STYLE = {
  new: 'bg-trail-soft text-trail',
  review: 'bg-amber-soft text-[#8a6410]',
  mastered: 'bg-[#ececec] text-muted',
};
