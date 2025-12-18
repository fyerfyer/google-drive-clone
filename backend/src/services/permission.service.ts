// import { AccessRole, ResourceType } from "../types/model.types";
// import File from "../models/File.model";
// import Folder from "../models/Folder.model";

// interface checkPermissionRequest {
//   userId: string;
//   resourceId: string;
//   resourceType: ResourceType; // 显式传入，减少数据库查询
//   requireRole: AccessRole;
// }

// export class PermissionService {
//   async checkPermission(data: checkPermissionRequest): Promise<boolean> {
//     let resource;
//     if (data.resourceType === "File") {
//       resource = await File.findById(data.resourceId);
//     } else {
//       resource = await Folder.findById(data.resourceId);
//     }

//     if (!resource) {
//       return false;
//     }
//   }
// }
