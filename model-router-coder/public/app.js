const button = document.querySelector("#load-models");
const statusBox = document.querySelector("#status");

button.addEventListener("click", async () => {
  button.disabled = true;
  statusBox.textContent = "Loading models...";
  try {
    const response = await fetch("/api/models");
    const body = await response.json();
    if (!body.ok) throw new Error(body.error || "Unknown error");
    const useful = body.models
      .filter((model) => /deepseek|qwen|kimi/i.test(model.id))
      .slice(0, 20)
      .map((model) => `${model.id} | in ${price(model.inputPrice)} | out ${price(model.outputPrice)}`)
      .join("\n");
    statusBox.textContent = useful || "No matching models found.";
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

function price(raw) {
  return `$${(raw * 1_000_000).toFixed(3)}/M`;
}
