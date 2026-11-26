// Address book for the signed-in customer (account → Addresses).
//
// Lives here rather than going through /rest/v1 because customers cannot
// DELETE through the REST layer, and "set default" has to clear the previous
// default in the same transaction.

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { GHANA_REGIONS } from '@/lib/shipping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ADDRESSES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = `id, label, full_name, phone, address_line1, address_line2,
  city, state, postal_code, country, is_default, created_at`;

function fail(message: string, status: number, fields?: Record<string, string>) {
    return NextResponse.json({ error: message, fields: fields || null }, { status });
}

async function customerId(req: NextRequest): Promise<string | null> {
    const header = req.headers.get('authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const verified = await verifyAccessToken(token);
    return verified?.userId || null;
}

function text(value: unknown, max = 200): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

type AddressInput = {
    label: string | null;
    full_name: string;
    phone: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
};

function readAddress(body: Record<string, unknown>): {
    value: AddressInput;
    fields: Record<string, string>;
} {
    const value: AddressInput = {
        label: text(body.label, 40) || null,
        full_name: text(body.full_name, 120),
        phone: text(body.phone, 30),
        address_line1: text(body.address_line1),
        address_line2: text(body.address_line2) || null,
        city: text(body.city, 80),
        state: text(body.state, 80),
        postal_code: text(body.postal_code, 20),
        country: text(body.country, 80),
    };

    const fields: Record<string, string> = {};
    if (!value.full_name) fields.full_name = 'Enter the name of the person receiving the order.';
    if (value.phone.replace(/\D/g, '').length < 7) fields.phone = 'Enter a phone number we can reach you on.';
    if (!value.address_line1) fields.address_line1 = 'Enter the area and street or house number.';
    if (!value.city) fields.city = 'Enter the city or town.';
    if (!value.country) fields.country = 'Enter the country.';
    if (value.country.toLowerCase() === 'ghana') {
        value.country = 'Ghana';
        if (!(GHANA_REGIONS as readonly string[]).includes(value.state)) {
            fields.state = 'Choose a region.';
        }
    }
    // state / postal_code stay optional outside Ghana; the columns are NOT NULL,
    // so an empty string is stored when the customer has none.
    return { value, fields };
}

export async function GET(req: NextRequest) {
    if (!isPlainPostgres()) return fail('Addresses are not available right now.', 503);
    const userId = await customerId(req);
    if (!userId) return fail('Sign in to see your addresses.', 401);

    try {
        const { rows } = await getPool().query(
            `SELECT ${COLUMNS} FROM addresses WHERE user_id = $1
             ORDER BY is_default DESC, created_at ASC`,
            [userId]
        );
        return NextResponse.json({ addresses: rows });
    } catch (err: any) {
        console.error('[addresses] list failed:', err?.message || err);
        return fail('We could not load your addresses. Please try again.', 500);
    }
}

export async function POST(req: NextRequest) {
    if (!isPlainPostgres()) return fail('Addresses are not available right now.', 503);
    const userId = await customerId(req);
    if (!userId) return fail('Sign in to save an address.', 401);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return fail('Nothing to save.', 400);
    const { value, fields } = readAddress(body);
    if (Object.keys(fields).length > 0) return fail('Check the highlighted fields.', 400, fields);

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        // Serialize this customer's address writes so two tabs cannot both end up default.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`addresses:${userId}`]);
        const existing = await client.query(
            'SELECT count(*)::int AS n FROM addresses WHERE user_id = $1',
            [userId]
        );
        const count: number = existing.rows[0]?.n ?? 0;
        if (count >= MAX_ADDRESSES) {
            await client.query('ROLLBACK');
            return fail(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`, 400);
        }

        // The first address is the default; otherwise only when asked.
        const makeDefault = count === 0 || body.is_default === true;
        if (makeDefault) {
            await client.query(
                'UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default',
                [userId]
            );
        }
        const { rows } = await client.query(
            `INSERT INTO addresses
               (user_id, type, is_default, label, full_name, phone, address_line1,
                address_line2, city, state, postal_code, country)
             VALUES ($1, 'shipping', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING ${COLUMNS}`,
            [
                userId, makeDefault, value.label, value.full_name, value.phone,
                value.address_line1, value.address_line2, value.city, value.state,
                value.postal_code, value.country,
            ]
        );
        await client.query('COMMIT');
        return NextResponse.json({ address: rows[0] }, { status: 201 });
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[addresses] create failed:', err?.message || err);
        return fail('We could not save this address. Please try again.', 500);
    } finally {
        client.release();
    }
}

export async function PATCH(req: NextRequest) {
    if (!isPlainPostgres()) return fail('Addresses are not available right now.', 503);
    const userId = await customerId(req);
    if (!userId) return fail('Sign in to change an address.', 401);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return fail('Nothing to save.', 400);
    const id = text(body.id, 36);
    if (!UUID.test(id)) return fail('This address could not be found.', 404);

    // { id, is_default: true } on its own is "Set Default"; anything else is a full edit.
    const defaultOnly = body.full_name === undefined && body.address_line1 === undefined;
    let value: AddressInput | null = null;
    if (!defaultOnly) {
        const parsed = readAddress(body);
        if (Object.keys(parsed.fields).length > 0) {
            return fail('Check the highlighted fields.', 400, parsed.fields);
        }
        value = parsed.value;
    } else if (body.is_default !== true) {
        return fail('Nothing to save.', 400);
    }

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`addresses:${userId}`]);
        const owned = await client.query(
            'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (!owned.rows[0]) {
            await client.query('ROLLBACK');
            return fail('This address could not be found.', 404);
        }

        if (body.is_default === true) {
            await client.query(
                'UPDATE addresses SET is_default = (id = $1) WHERE user_id = $2',
                [id, userId]
            );
        }
        if (value) {
            await client.query(
                `UPDATE addresses SET
                   label = $3, full_name = $4, phone = $5, address_line1 = $6,
                   address_line2 = $7, city = $8, state = $9, postal_code = $10, country = $11
                 WHERE id = $1 AND user_id = $2`,
                [
                    id, userId, value.label, value.full_name, value.phone,
                    value.address_line1, value.address_line2, value.city, value.state,
                    value.postal_code, value.country,
                ]
            );
        }
        const { rows } = await client.query(
            `SELECT ${COLUMNS} FROM addresses WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        await client.query('COMMIT');
        return NextResponse.json({ address: rows[0] });
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[addresses] update failed:', err?.message || err);
        return fail('We could not save this address. Please try again.', 500);
    } finally {
        client.release();
    }
}

export async function DELETE(req: NextRequest) {
    if (!isPlainPostgres()) return fail('Addresses are not available right now.', 503);
    const userId = await customerId(req);
    if (!userId) return fail('Sign in to delete an address.', 401);

    const id = (req.nextUrl.searchParams.get('id') || '').trim();
    if (!UUID.test(id)) return fail('This address could not be found.', 404);

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`addresses:${userId}`]);
        const deleted = await client.query(
            'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING is_default',
            [id, userId]
        );
        if (!deleted.rows[0]) {
            await client.query('ROLLBACK');
            return fail('This address could not be found.', 404);
        }
        // Deleting the default hands it to the oldest address that is left.
        if (deleted.rows[0].is_default) {
            await client.query(
                `UPDATE addresses SET is_default = true
                 WHERE id = (
                   SELECT id FROM addresses WHERE user_id = $1
                   ORDER BY created_at ASC LIMIT 1
                 )`,
                [userId]
            );
        }
        await client.query('COMMIT');
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[addresses] delete failed:', err?.message || err);
        return fail('We could not delete this address. Please try again.', 500);
    } finally {
        client.release();
    }
}
