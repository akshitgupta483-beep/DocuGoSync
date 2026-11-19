const $ = (id) => document.getElementById(id);
let pollTimer = null;

$("scanBtn").addEventListener("click", startScan);
$("repo").addEventListener("keydown", (event) => {
  if (event.key === "Enter") startScan();
});

async function startScan() {
  const repository_url = $("repo").value.trim();
  $("error").classList.add("hidden");
  $("results").classList.add("hidden");
  if (!repository_url) return showError("Enter a GitHub repository URL.");
  $("scanBtn").disabled = true;
  $("scanBtn").textContent = "Starting…";
  $("progressWrap").classList.remove("hidden");
  setProgress(0, "Submitting repository…");
  try {
    const response = await fetch("/api/scan", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({repository_url})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start scan.");
    clearInterval(pollTimer);
    pollTimer = setInterval(() => poll(data.scan_id), 1200);
    poll(data.scan_id);
  } catch (error) {
    finishButton();
    showError(error.message);
  }
}

async function poll(id) {
  try {
    const response = await fetch(`/api/results/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to retrieve scan.");
    setProgress(data.progress || 0, data.stage || data.status);
    if (data.status === "completed") {
      clearInterval(pollTimer); finishButton(); renderResults(data.result);
    } else if (data.status === "failed") {
      clearInterval(pollTimer); finishButton(); showError(data.error || "Scan failed.");
    }
  } catch (error) {
    clearInterval(pollTimer); finishButton(); showError(error.message);
  }
}

function setProgress(value, stage) {
  $("progressBar").style.width = `${value}%`;
  $("percent").textContent = `${value}%`;
  $("stage").textContent = stage;
}
function finishButton() {
  $("scanBtn").disabled = false;
  $("scanBtn").innerHTML = 'Scan repository <span>→</span>';
}
function showError(message) {
  $("error").textContent = message;
  $("error").classList.remove("hidden");
}
function renderResults(result) {
  $("results").classList.remove("hidden");
  $("repoName").textContent = result.repo_name || "Repository results";
  $("scanStatus").textContent = "Completed";
  const s = result.statistics;
  const stats = [
    ["Python files", s.python_files], ["Docs files", s.documentation_files],
    ["Claims extracted", s.claims_extracted], ["Drift findings", s.drift_findings]
  ];
  $("stats").innerHTML = stats.map(([label, value]) =>
    `<div class="stat"><b>${escapeHtml(value)}</b><span>${label}</span></div>`).join("");
  $("findingCount").textContent = `${result.findings.length} finding(s)`;
  if (!result.findings.length) {
    $("findingList").innerHTML = '<div class="empty">No supported documentation drift patterns were detected. This does not prove that every documentation statement is correct.</div>';
  } else {
    $("findingList").innerHTML = result.findings.map(f => `
      <article class="finding">
        <div class="finding-top"><div><h4>${escapeHtml(f.title)}</h4><p>${escapeHtml(f.message)}</p></div><span class="tag">${escapeHtml(f.type.replaceAll("_"," "))}</span></div>
        <div class="evidence">
          <code>DOC · ${escapeHtml(f.doc_file)}:${escapeHtml(f.doc_line)}</code>
          ${f.code_file ? `<code>CODE · ${escapeHtml(f.code_file)}:${escapeHtml(f.code_line)}</code>` : ""}
          <code>${f.evidence_verified ? "Evidence checked" : "Evidence not verified"}</code>
        </div>
      </article>`).join("");
  }
  $("notice").textContent = result.notice || "";
  $("results").scrollIntoView({behavior:"smooth", block:"start"});
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
