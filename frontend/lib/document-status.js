function isProcessingStatus(status) {
  return status === "queued" || status === "processing";
}

function statusTone(status) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (status === "failed" || status === "needs_ocr") {
    return "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
}

module.exports = {
  isProcessingStatus,
  statusTone,
};
