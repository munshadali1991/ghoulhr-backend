export type PeopleDirectoryItemDto = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  status: string;
  departmentName: string | null;
  designationName: string | null;
  dateOfJoining: string | null;
  profilePhotoPreviewUrl: string | null;
};

export type PeopleManagerSummaryDto = {
  id: string;
  name: string;
  designationName: string | null;
};

export type PeopleProfileDto = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  address: string | null;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  dateOfJoining: string | null;
  profilePhotoPreviewUrl: string | null;
  manager: PeopleManagerSummaryDto | null;
};

export type PaginatedPeopleDto = {
  items: PeopleDirectoryItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
