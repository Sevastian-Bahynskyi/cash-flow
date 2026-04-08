export type CategoryRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  name: string;
  level: 1 | 2;
  is_system: boolean;
};

export type CategoryOption = {
  id: string;
  name: string;
  parentName: string;
  searchKey: string;
};
