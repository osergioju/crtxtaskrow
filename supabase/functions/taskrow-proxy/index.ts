const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-taskrow-key, x-taskrow-path',
};

const TASKROW_HOST = 'https://crtcomunicacao.taskrow.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const taskrowKey = req.headers.get('x-taskrow-key');
    const taskrowPath = req.headers.get('x-taskrow-path');

    if (!taskrowKey || !taskrowPath) {
      return new Response(JSON.stringify({ error: 'Missing x-taskrow-key or x-taskrow-path header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const targetUrl = new URL(`${TASKROW_HOST}${taskrowPath}`);
    // Forward query params
    url.searchParams.forEach((v, k) => {
      if (k !== '') targetUrl.searchParams.append(k, v);
    });

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        '__identifier': taskrowKey,
        'Content-Type': 'application/json',
      },
    };

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      fetchOptions.body = await req.text();
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Taskrow proxy error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
