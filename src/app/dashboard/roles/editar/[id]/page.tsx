"use client";

import { useParams } from "next/navigation";
import EditRoleForm from "@/components/dashboard/roles/form/EditRoleForm";

export default function EditRolePage() {
  const params = useParams();
  const rolId = params.id as string;

  return <EditRoleForm rolId={rolId} />;
}
