# 0.60.634: Storage and data always shows the Windows drive

James, 2026-11-22: "Yes, deploy it". On his live COS the tab showed only D:. The Windows service is not told COS's app folder, so C: and its 2.2 GB
warning were gone, though the preview had them. The system drive is now always read, and labelled Windows unless COS or Nexus lives on it (SC19 slice a).

Proof: GET /api/cos/storage on his running COS lists C: and D: and its headline names C:.
