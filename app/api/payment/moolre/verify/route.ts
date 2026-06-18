import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Payment verification endpoint.
 * Called from the order-success page after the user completes payment on Moolre.
 *
 * SECURITY: We ONLY trust Moolre's status API response for payment verification.
 * Uses the same externalref that was sent when the payment link was created.
 */

type MoolreStatusResult = {
    status?: number | string;
    code?: string;
    message?: string;
    data?: {
        txstatus?: number | string;
        txtstatus?: number | string;
        amount?: string | number;
        value?: string | number;
        transactionid?: string;
        thirdpartyref?: string;
        externalref?: string;
    };
};

function isMoolreStatusSuccess(result: MoolreStatusResult): boolean {
    if (result.status !== 1 && result.status !== '1') return false;
    if (!result.data || typeof result.data !== 'object') return false;

    const txStatus = result.data.txstatus ?? result.data.txtstatus;
    const txOk = txStatus === 1 || txStatus === '1';
    const messageStr = String(result.message || '').toLowerCase();
    const messageIndicatesFailure =
        messageStr.includes('fail') ||
        messageStr.includes('error') ||
        messageStr.includes('declin') ||
        messageStr.includes('cancel');

    return txOk && !messageIndicatesFailure;
}

function amountMatchesOrder(result: MoolreStatusResult, expectedAmount: number): boolean {
    const rawAmount = result.data?.amount ?? result.data?.value;
    if (rawAmount == null || rawAmount === '') return false;

    const paidAmount = parseFloat(String(rawAmount));
    if (Number.isNaN(paidAmount)) return false;

    return Math.abs(paidAmount - expectedAmount) <= 0.01;
}

async function fetchMoolrePaymentStatus(externalRef: string): Promise<MoolreStatusResult | null> {
    const response = await fetch('https://api.moolre.com/open/transact/status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-USER': process.env.MOOLRE_API_USER!,
            'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY!
        },
        body: JSON.stringify({
            type: 1,
            idtype: '1',
            id: externalRef,
            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER
        })
    });

    return response.json();
}

export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests' },
                { status: 429 }
            );
        }

        const { orderNumber } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        console.log('[Verify] Checking payment for:', orderNumber);

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            console.log('[Verify] Order already paid:', orderNumber);
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid'
            });
        }

        if (order.metadata?.payment_method && order.metadata.payment_method !== 'moolre') {
            return NextResponse.json({
                success: false,
                message: 'This order does not use Moolre payment'
            }, { status: 400 });
        }

        if (
            !process.env.MOOLRE_API_USER ||
            !process.env.MOOLRE_API_PUBKEY ||
            !process.env.MOOLRE_ACCOUNT_NUMBER
        ) {
            console.error('[Verify] Missing Moolre API credentials');
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment verification unavailable'
            }, { status: 503 });
        }

        const refsToTry = [
            order.metadata?.moolre_external_ref,
            orderNumber
        ].filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

        const uniqueRefs = [...new Set(refsToTry)];

        let verifiedResult: MoolreStatusResult | null = null;

        for (const externalRef of uniqueRefs) {
            try {
                const checkResult = await fetchMoolrePaymentStatus(externalRef);
                console.log('[Verify] Moolre status response for', externalRef, ':', JSON.stringify(checkResult));

                if (
                    checkResult &&
                    isMoolreStatusSuccess(checkResult) &&
                    amountMatchesOrder(checkResult, Number(order.total))
                ) {
                    verifiedResult = checkResult;
                    break;
                }
            } catch (moolreError: any) {
                console.warn('[Verify] Moolre status check failed for', externalRef, ':', moolreError.message);
            }
        }

        if (!verifiedResult) {
            console.log('[Verify] Cannot verify payment for:', orderNumber);
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider'
            });
        }

        const moolreRef =
            verifiedResult.data?.transactionid ||
            verifiedResult.data?.thirdpartyref ||
            'moolre-api-verify';

        console.log('[Verify] Marking order paid via moolre-api for:', orderNumber);

        const { data: orderJson, error: updateError } = await supabaseAdmin
            .rpc('mark_order_paid', {
                order_ref: orderNumber,
                moolre_ref: String(moolreRef)
            });

        if (updateError) {
            console.error('[Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        console.log('[Verify] Order marked as paid:', orderNumber);

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            } catch (statsError: any) {
                console.error('[Verify] Customer stats failed:', statsError.message);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
                console.log('[Verify] Notifications sent for:', orderNumber);
            } catch (notifyError: any) {
                console.error('[Verify] Notification failed:', notifyError.message);
            }
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated'
        });

    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
