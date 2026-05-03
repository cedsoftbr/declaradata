HIDDEN_PATHS = {
    '/api/auth/password/reset/',
    '/api/auth/password/reset/confirm/',
}


def remove_internal_endpoints(endpoints, **_kwargs):
    return [
        (path, path_regex, method, callback)
        for path, path_regex, method, callback in endpoints
        if path not in HIDDEN_PATHS
    ]
