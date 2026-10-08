export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Middleware Autentikasi
    if (path !== '/') {
      const authHeader = request.headers.get('Authorization');
      const expectedAuth = `Bearer ${env.API_SECRET_KEY}`;
      if (!authHeader || authHeader !== expectedAuth) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing API Key' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // --- 1. AKUN (LOGIN / LOGOUT / LIST) ---
    if (path === '/account/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { account_id, bot_token, chat_id } = body;
        if (!account_id || !bot_token || !chat_id) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
        
        const testRes = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
        const testJson = await testRes.json();
        if (!testJson.ok) return new Response(JSON.stringify({ error: 'Invalid Bot Token' }), { status: 400 });

        const botName = testJson.result.username;
        await env.DB.prepare(
          `INSERT INTO accounts (account_id, bot_token, chat_id, bot_name, logged_in_at) VALUES (?, ?, ?, ?, ?) 
           ON CONFLICT(account_id) DO UPDATE SET bot_token=excluded.bot_token, chat_id=excluded.chat_id, bot_name=excluded.bot_name`
        ).bind(account_id, bot_token, chat_id, botName, new Date().toISOString()).run();

        return new Response(JSON.stringify({ success: true, message: `Account @${botName} logged in` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    if (path === '/accounts' && request.method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT account_id, bot_name, chat_id, logged_in_at FROM accounts`).all();
      return new Response(JSON.stringify({ success: true, data: results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/account/logout' && request.method === 'POST') {
      const body = await request.json();
      await env.DB.prepare(`DELETE FROM accounts WHERE account_id = ?`).bind(body.account_id).run();
      return new Response(JSON.stringify({ success: true, message: 'Logged out' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // --- 2. UPLOAD FILE & EKSTRAKSI THUMBNAIL ---
    if (path === '/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const accountId = formData.get('account_id');
        if (!file || !accountId) return new Response(JSON.stringify({ error: 'Missing file or account_id' }), { status: 400 });
        
        const account = await env.DB.prepare(`SELECT * FROM accounts WHERE account_id = ?`).bind(accountId).first();
        if (!account) return new Response(JSON.stringify({ error: 'Account not found' }), { status: 400 });

        const telegramFormData = new FormData();
        telegramFormData.append('chat_id', account.chat_id);
        telegramFormData.append('document', file);

        const telegramResponse = await fetch(`https://api.telegram.org/bot${account.bot_token}/sendDocument`, {
          method: 'POST', body: telegramFormData,
        });
        const result = await telegramResponse.json();
        if (!result.ok) throw new Error(result.description || 'Upload failed');

        const doc = result.result.document;
        const messageId = result.result.message_id;
        const fileName = doc.file_name || file.name;
        const extension = fileName.split('.').pop().toLowerCase();
        
        // Ambil thumb_file_id jika ada (biasanya Telegram menyediakan array thumbnail pada dokumen/video)
        let thumbFileId = null;
        if (doc.thumbnail && doc.thumbnail.file_id) {
          thumbFileId = doc.thumbnail.file_id;
        } else if (result.result.photo && result.result.photo.length > 0) {
          // Jika dikirim sebagai photo, ambil resolusi terkecil untuk thumbnail
          thumbFileId = result.result.photo[0].file_id;
        }

        await env.DB.prepare(
          `INSERT INTO files (file_id, message_id, file_name, file_size, mime_type, extension, thumb_file_id, account_id, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(doc.file_id, messageId, fileName, doc.file_size, doc.mime_type, extension, thumbFileId, accountId, new Date().toISOString()).run();

        return new Response(JSON.stringify({ success: true, data: { file_id: doc.file_id, file_name: fileName } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // --- 3. FILE MANAGER ENDPOINT (/files) ---
    if (path === '/files') {
      if (request.method === 'GET') {
        const accountIdFilter = url.searchParams.get('account_id');
        const filter = url.searchParams.get('filter') || 'all';
        const search = url.searchParams.get('search') || '';
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const maxview = parseInt(url.searchParams.get('maxview') || '20', 10);
        const offset = (page - 1) * maxview;

        let query = `SELECT * FROM files WHERE 1=1`;
        let countQuery = `SELECT COUNT(*) as total FROM files WHERE 1=1`;
        let params = [], countParams = [];

        if (accountIdFilter) { query += ` AND account_id = ?`; countQuery += ` AND account_id = ?`; params.push(accountIdFilter); countParams.push(accountIdFilter); }
        if (filter !== 'all') { query += ` AND extension = ?`; countQuery += ` AND extension = ?`; params.push(filter.toLowerCase()); countParams.push(filter.toLowerCase()); }
        if (search) { query += ` AND file_name LIKE ?`; countQuery += ` AND file_name LIKE ?`; params.push(`%${search}%`); countParams.push(`%${search}%`); }

        const totalRes = await env.DB.prepare(countQuery).bind(...countParams).first();
        query += ` ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`;
        params.push(maxview, offset);

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({
          success: true,
          pagination: { page, maxview, total_items: totalRes.total, total_pages: Math.ceil(totalRes.total / maxview) || 1 },
          data: results
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (request.method === 'DELETE') {
        const body = await request.json();
        const fileData = await env.DB.prepare(`SELECT * FROM files WHERE file_id = ?`).bind(body.file_id).first();
        if (!fileData) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 });

        const account = await env.DB.prepare(`SELECT * FROM accounts WHERE account_id = ?`).bind(fileData.account_id).first();
        if (account && fileData.message_id) {
          await fetch(`https://api.telegram.org/bot${account.bot_token}/deleteMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: account.chat_id, message_id: fileData.message_id })
          });
        }
        await env.DB.prepare(`DELETE FROM files WHERE file_id = ?`).bind(body.file_id).run();
        return new Response(JSON.stringify({ success: true, message: 'Deleted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (request.method === 'PUT') {
        const body = await request.json();
        const newExt = body.new_file_name.split('.').pop().toLowerCase();
        await env.DB.prepare(`UPDATE files SET file_name = ?, extension = ? WHERE file_id = ?`).bind(body.new_file_name, newExt, body.file_id).run();
        return new Response(JSON.stringify({ success: true, message: 'Renamed' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // --- 4. DOWNLOAD / THUMBNAIL STREAMING ---
    if (path === '/download' && request.method === 'GET') {
      const accountId = url.searchParams.get('account_id');
      const fileId = url.searchParams.get('file_id');
      const isThumb = url.searchParams.get('type') === 'thumb';

      if (!accountId || !fileId) return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });

      const account = await env.DB.prepare(`SELECT * FROM accounts WHERE account_id = ?`).bind(accountId).first();
      if (!account) return new Response(JSON.stringify({ error: 'Account not found' }), { status: 404 });

      // Jika meminta thumbnail, ambil thumb_file_id dari database
      let targetFileId = fileId;
      if (isThumb) {
        const fileRecord = await env.DB.prepare(`SELECT thumb_file_id FROM files WHERE file_id = ?`).bind(fileId).first();
        if (fileRecord && fileRecord.thumb_file_id) {
          targetFileId = fileRecord.thumb_file_id;
        } else {
          return new Response('Thumbnail not available', { status: 404 });
        }
      }

      let filePath = await env.CACHE_KV.get(`path_${targetFileId}`);
      if (!filePath) {
        const res = await fetch(`https://api.telegram.org/bot${account.bot_token}/getFile?file_id=${targetFileId}`);
        const json = await res.json();
        if (!json.ok) return new Response('File not found on Telegram', { status: 404 });
        filePath = json.result.file_path;
        await env.CACHE_KV.put(`path_${targetFileId}`, filePath, { expirationTtl: 3000 });
      }

      const fileStream = await fetch(`https://api.telegram.org/file/bot${account.bot_token}/${filePath}`);
      return new Response(fileStream.body, {
        status: 200,
        headers: {
          'Content-Type': fileStream.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
        },
      });
    }

    return new Response('Telegram Cloud Storage API is running.', { status: 200 });
  },
};
