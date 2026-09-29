/**
 * Business Rule Evaluator for Sales Order Items
 * Spec: CDS view I_SALESDOCUMENTITEM
 * - Quantity: ConfdDelivQtyInOrderQtyUnit
 * - Unit: OrderQuantitySAPUnit ('ZMT')
 * - Threshold: <= 5.0
 * - Status: SDProcessStatus === 'A' (Open only)
 */

function evaluateItem(item, threshold = 5.0, targetUnit = 'ZMT') {
  // 1. Confirmed Delivery Quantity in Order Quantity Unit
  const confdQty = parseFloat(
    item.ConfdDelivQtyInOrderQtyUnit ??
    item.CONFDDELIVQTYINORDERQTYUNIT ??
    item.RequestedQuantity ??
    '0'
  );

  // 2. Associated unit field is OrderQuantitySAPUnit
  const sapUnit = item.OrderQuantitySAPUnit || item.ORDERQUANTITYSAPUNIT || item.RequestedQuantitySAPUnit || '';
  const unit = item.OrderQuantityUnit || item.ORDERQUANTITYUNIT || item.RequestedQuantityUnit || '';
  const procStatus = item.SDProcessStatus || '';
  const currentRejection = item.SalesDocumentRjcnReason || '';

  // Check unit: Must be ZMT (either in OrderQuantitySAPUnit or OrderQuantityUnit)
  const isZmt = (
    sapUnit.toUpperCase() === targetUnit.toUpperCase() ||
    unit.toUpperCase() === targetUnit.toUpperCase() ||
    (unit.toUpperCase() === 'MT' && (sapUnit.toUpperCase() === 'ZMT' || !sapUnit))
  );

  if (!isZmt) {
    return {
      eligible: false,
      category: 'NON_ZMT',
      reason: `Unit is '${unit || sapUnit}', not ${targetUnit} (skipped)`,
      quantity: confdQty,
      unit: unit || sapUnit,
      item
    };
  }

  // 3. Check quantity: Must be less than or equal to threshold (<= 5 ZMT)
  if (confdQty > threshold) {
    return {
      eligible: false,
      category: 'OVER_THRESHOLD',
      reason: `Confirmed Quantity ${confdQty} ${targetUnit} > threshold (${threshold})`,
      quantity: confdQty,
      unit: targetUnit,
      item
    };
  }

  // 4. Check existing rejection reason
  if (currentRejection && currentRejection.trim() !== '') {
    return {
      eligible: false,
      category: 'ALREADY_REJECTED',
      reason: `Already short-closed/rejected with code '${currentRejection}'`,
      quantity: confdQty,
      unit: targetUnit,
      item
    };
  }

  // 5. Check status: Only match items where SDProcessStatus is exactly 'A' (Open)
  if (procStatus !== 'A') {
    return {
      eligible: false,
      category: 'NOT_OPEN',
      reason: `Item status SDProcessStatus is '${procStatus || 'Initial'}', not 'A' (Open)`,
      quantity: confdQty,
      unit: targetUnit,
      item
    };
  }

  // All criteria met!
  return {
    eligible: true,
    category: 'ELIGIBLE',
    reason: `Confirmed Quantity ${confdQty} ${targetUnit} <= ${threshold} and status is Open (SDProcessStatus='A')`,
    quantity: confdQty,
    unit: targetUnit,
    item
  };
}

module.exports = {
  evaluateItem
};
