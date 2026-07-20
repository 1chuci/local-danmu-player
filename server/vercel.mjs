import app from './app.mjs'

function getRequestUrl(request) {
  return new URL(request.url || '/', 'http://vercel.local')
}

export function createVercelHandler(route) {
  return (request, response) => {
    const url = getRequestUrl(request)
    const routePath = typeof route === 'function' ? route(request, url) : route
    request.url = `${routePath}${url.search}`
    return app(request, response)
  }
}
