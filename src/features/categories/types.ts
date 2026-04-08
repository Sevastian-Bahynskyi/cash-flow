export type CategoryRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  name: string;
  level: 1 | 2;
  is_system: boolean;
  icon: string;
  color: string;
};

export type CategoryOption = {
  id: string;
  name: string;
  parentName: string;
  searchKey: string;
  parentId: string;
  icon: string;
  color: string;
  parentColor: string;
  parentIcon: string;
};
