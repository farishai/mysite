// Where submissions go. Set this to a form-backend URL (e.g. a Formspree endpoint
// like "https://formspree.io/f/xxxxxxx") to receive responses by email/dashboard.
// If left empty, the form falls back to opening an email to RECIPIENT_EMAIL.
const FORM_ENDPOINT = "";
const RECIPIENT_EMAIL = "faarishiraaf.af@gmail.com";

const form = document.getElementById("uniform-form");
const statusEl = document.getElementById("status");

function collect() {
	const fd = new FormData(form);
	const data = {};
	for (const [k, v] of fd.entries()) if (k !== "activity") data[k] = v.trim();
	data.activities = fd.getAll("activity").join(", ");
	return data;
}

function validate() {
	let ok = true, first = null;
	form.querySelectorAll("[required]").forEach(el => {
		const bad = !el.value.trim() || !el.checkValidity();
		el.classList.toggle("invalid", bad);
		if (bad) { ok = false; first = first || el; }
	});
	const err = form.querySelector('[data-for="activity"]');
	const none = !form.querySelector('input[name="activity"]:checked');
	err.textContent = none ? "Please select at least one activity." : "";
	if (none) { ok = false; first = first || form.querySelector('input[name="activity"]'); }
	if (first) first.focus();
	return ok;
}

function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = cls || ""; }

form.addEventListener("submit", async e => {
	e.preventDefault();
	if (!validate()) { setStatus("Please fix the highlighted fields.", "fail"); return; }
	const data = collect();

	if (FORM_ENDPOINT) {
		try {
			const res = await fetch(FORM_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json", "Accept": "application/json" },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error(res.status);
			form.reset();
			setStatus("Thank you! Your uniform sizes have been submitted.", "ok");
		} catch (err) {
			setStatus("Sorry, something went wrong. Please try again.", "fail");
		}
		return;
	}

	const body = Object.entries(data).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("\n");
	const subject = `Uniform sizes: ${data.first_name} ${data.last_name}`;
	window.location.href = `mailto:${RECIPIENT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	setStatus("Your email app should open with the details. Please press send to finish.", "ok");
});

form.addEventListener("input", e => e.target.classList.remove("invalid"));
