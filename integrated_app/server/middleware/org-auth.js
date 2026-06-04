const dbHandler = require('../functionality/database/handler');

function normalizeOrg(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    contactEmail: row.contact_email,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

async function requireOrgAuth(req, res, next) {
  try {
    const apiKey = req.header('X-Org-API-Key') || req.header('x-org-api-key');
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Missing organization API key. Provide X-Org-API-Key header.'
      });
    }

    const orgRow = await dbHandler.findOrganizationByApiKey(apiKey);
    if (!orgRow) {
      return res.status(401).json({ success: false, error: 'Invalid organization API key.' });
    }
    if (orgRow.is_active === false) {
      return res.status(403).json({ success: false, error: 'Organization is inactive. Contact admin.' });
    }

    req.org = normalizeOrg(orgRow);
    next();
  } catch (error) {
    console.error('Org auth error:', error.message);
    res.status(500).json({ success: false, error: 'Organization authentication failed.' });
  }
}

module.exports = { requireOrgAuth, normalizeOrg };
