from flask import Blueprint, render_template_string

welcome_bp = Blueprint('welcome', __name__)


@welcome_bp.route('/welcome/<token>')
def welcome(token):
    # Simple HTML page to gather clipboard and screen-recording consent
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Assessment Consent</title>
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f9fafb; margin:0; }}
        .container {{ max-width: 720px; margin: 5vh auto; background:#fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 24px; }}
        h1 {{ margin: 0 0 8px 0; font-size: 20px; }}
        p {{ color:#374151; line-height:1.6; }}
        .card {{ border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-top:16px; }}
        .row {{ display:flex; align-items:center; justify-content:space-between; margin-top:8px; }}
        .btn {{ display:inline-block; padding:8px 14px; background:#2563eb; color:#fff; border-radius:6px; cursor:pointer; border:none; }}
        .btn:disabled {{ background:#9ca3af; cursor:not-allowed; }}
        .ok {{ color:#059669; font-weight:600; }}
        .warn {{ color:#b45309; }}
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Before you begin</h1>
        <p>
          Please grant the following permissions so we can run your assessment smoothly.
          You must grant both to proceed.
        </p>

        <div class="card">
          <h3>Clipboard Access</h3>
          <p class="warn">We log copy and paste events to ensure assessment integrity.</p>
          <div class="row">
            <div id="clipboard-status">Status: Not granted</div>
            <button id="clipboard-btn" class="btn">Grant Clipboard Access</button>
          </div>
        </div>

        <div class="card">
          <h3>Screen Recording Permission</h3>
          <p class="warn">We may request display capture permission for integrity checks.</p>
          <div class="row">
            <div id="screen-status">Status: Not granted</div>
            <button id="screen-btn" class="btn">Grant Screen Recording</button>
          </div>
        </div>

        <div class="row" style="margin-top:24px;">
          <div></div>
          <button id="proceed-btn" class="btn" disabled>Proceed to Assessment</button>
        </div>
      </div>

      <script>
        const token = {token_str};
        const clipboardBtn = document.getElementById('clipboard-btn');
        const screenBtn = document.getElementById('screen-btn');
        const proceedBtn = document.getElementById('proceed-btn');
        const clipboardStatus = document.getElementById('clipboard-status');
        const screenStatus = document.getElementById('screen-status');

        let clipboardGranted = false;
        let screenGranted = false;

        function updateProceed() {
          proceedBtn.disabled = !(clipboardGranted && screenGranted);
        }

        clipboardBtn.addEventListener('click', async () => {
          try {
            // Clipboard read requires a user gesture; this will prompt where supported
            const txt = await navigator.clipboard.readText();
            clipboardGranted = true;
            clipboardStatus.textContent = 'Status: Granted';
            clipboardStatus.className = 'ok';
          } catch (e) {
            // Some browsers require HTTPS/user activation; provide a fallback instruction
            alert('Please press Cmd/Ctrl+C to copy some text, then click this button again to grant access.');
          } finally {
            updateProceed();
          }
        });

        screenBtn.addEventListener('click', async () => {
          try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            // Immediately stop tracks; we only needed the permission grant
            stream.getTracks().forEach(t => t.stop());
            screenGranted = true;
            screenStatus.textContent = 'Status: Granted';
            screenStatus.className = 'ok';
          } catch (e) {
            alert('Screen recording permission was denied. Please try again.');
          } finally {
            updateProceed();
          }
        });

        proceedBtn.addEventListener('click', () => {
          // Redirect through server access route to produce the subdomain URL with token
          window.location.href = '/instances/access/' + token;
        });
      </script>
    </body>
    </html>
    """.replace('{token_str}', repr(token))

    return render_template_string(html)


