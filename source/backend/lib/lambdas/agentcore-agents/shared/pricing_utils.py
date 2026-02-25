"""
Shared pricing utilities for AgentCore agents.

This module provides common pricing functions used across all pricing analysis agents,
including price rounding, pricing boundary calculations, and default pricing logic
for handling missing MAP/MSRP values.

Pricing Default Logic:
- When MAP=0 or null: Minimum price determined solely by margin requirements
- When MSRP=0 or null: Maximum price defaults to 3x cost
- Validation: Only cost must be > 0; MAP and MSRP are optional
"""

from typing import Optional, Dict, Any


def round_to_nearest_dollar(price: float) -> float:
    """
    Round a price to the nearest dollar.
    
    This function rounds prices to the nearest whole dollar amount, with values
    ending in .50 or higher rounded up, and values below .50 rounded down.
    
    Args:
        price: The price to round (float)
        
    Returns:
        The price rounded to the nearest dollar (float)
        
    Examples:
        >>> round_to_nearest_dollar(86.49)
        86.0
        >>> round_to_nearest_dollar(86.50)
        87.0
        >>> round_to_nearest_dollar(86.99)
        87.0
        >>> round_to_nearest_dollar(86.00)
        86.0
    """
    return round(price)


def calculate_price_floor(cost: float, map_price: Optional[float], min_margin: float) -> float:
    """
    Calculate the minimum allowable price (price floor) based on cost, MAP, and margin requirements.
    
    The price floor is the maximum of:
    1. Margin-based minimum: cost / (1 - min_margin)
    2. MAP constraint: MAP if MAP > 0, otherwise 0
    
    When MAP is 0 or null, the price floor is determined solely by margin requirements.
    
    Args:
        cost: Product cost (must be > 0)
        map_price: Minimum Advertised Price (can be 0 or None)
        min_margin: Minimum required margin as decimal (e.g., 0.30 for 30%)
        
    Returns:
        Calculated price floor (minimum allowable price)
        
    Raises:
        ValueError: If cost <= 0 or min_margin >= 1.0
        
    Examples:
        >>> calculate_price_floor(50.0, 89.99, 0.30)
        89.99  # MAP is higher than margin requirement
        
        >>> calculate_price_floor(50.0, 0, 0.30)
        71.43  # MAP is 0, use margin requirement only
        
        >>> calculate_price_floor(50.0, None, 0.30)
        71.43  # MAP is None, use margin requirement only
        
        >>> calculate_price_floor(50.0, 60.0, 0.30)
        71.43  # Margin requirement is higher than MAP
    """
    # Validate inputs
    if cost <= 0:
        raise ValueError(f"Cost must be positive, got: {cost}")
    
    if min_margin >= 1.0:
        raise ValueError(f"Minimum margin must be less than 1.0, got: {min_margin}")
    
    # Calculate margin-based minimum price
    # Formula: cost / (1 - min_margin)
    # Example: $50 cost with 30% margin = $50 / 0.70 = $71.43
    margin_based_floor = cost / (1 - min_margin)
    
    # Calculate MAP-based floor (0 if MAP is None or 0)
    map_based_floor = map_price if map_price and map_price > 0 else 0
    
    # Return the maximum of the two constraints
    return max(margin_based_floor, map_based_floor)


def calculate_price_ceiling(cost: float, msrp: Optional[float], default_multiplier: float = 3.0) -> float:
    """
    Calculate the maximum recommended price (price ceiling) based on cost and MSRP.
    
    The price ceiling is:
    1. MSRP if MSRP > 0
    2. cost * default_multiplier if MSRP is 0 or None
    
    When MSRP is 0 or null, the price ceiling defaults to a multiple of cost (default 3x).
    
    Args:
        cost: Product cost (must be > 0)
        msrp: Manufacturer's Suggested Retail Price (can be 0 or None)
        default_multiplier: Multiplier to use when MSRP is missing (default: 3.0)
        
    Returns:
        Calculated price ceiling (maximum recommended price)
        
    Raises:
        ValueError: If cost <= 0 or default_multiplier <= 1.0
        
    Examples:
        >>> calculate_price_ceiling(50.0, 129.99)
        129.99  # MSRP is provided
        
        >>> calculate_price_ceiling(50.0, 0)
        150.0  # MSRP is 0, use 3x cost
        
        >>> calculate_price_ceiling(50.0, None)
        150.0  # MSRP is None, use 3x cost
        
        >>> calculate_price_ceiling(50.0, None, 2.5)
        125.0  # MSRP is None, use custom multiplier
    """
    # Validate inputs
    if cost <= 0:
        raise ValueError(f"Cost must be positive, got: {cost}")
    
    if default_multiplier <= 1.0:
        raise ValueError(f"Default multiplier must be greater than 1.0, got: {default_multiplier}")
    
    # Use MSRP if provided and > 0, otherwise use cost multiplier
    if msrp and msrp > 0:
        return msrp
    else:
        return cost * default_multiplier


def apply_pricing_constraints(price: float, floor: float, ceiling: float) -> float:
    """
    Apply pricing constraints to ensure price falls within acceptable boundaries.
    
    Adjusts the price to be within the floor (minimum) and ceiling (maximum) bounds.
    
    Args:
        price: The price to constrain
        floor: Minimum allowable price (price floor)
        ceiling: Maximum allowable price (price ceiling)
        
    Returns:
        Constrained price within [floor, ceiling] range
        
    Examples:
        >>> apply_pricing_constraints(95.0, 89.99, 129.99)
        95.0  # Price is within bounds
        
        >>> apply_pricing_constraints(85.0, 89.99, 129.99)
        89.99  # Price adjusted to floor
        
        >>> apply_pricing_constraints(135.0, 89.99, 129.99)
        129.99  # Price adjusted to ceiling
    """
    # Ensure price is at least the floor
    if price < floor:
        return floor
    
    # Ensure price is at most the ceiling
    if price > ceiling:
        return ceiling
    
    return price


def calculate_pricing_boundaries(
    cost: float,
    map_price: Optional[float],
    msrp: Optional[float],
    min_margin: float,
    default_ceiling_multiplier: float = 3.0
) -> Dict[str, Any]:
    """
    Calculate complete pricing boundaries including floor, ceiling, and validation.
    
    This is a convenience function that combines calculate_price_floor and
    calculate_price_ceiling to provide complete pricing boundary information.
    
    Args:
        cost: Product cost (must be > 0)
        map_price: Minimum Advertised Price (can be 0 or None)
        msrp: Manufacturer's Suggested Retail Price (can be 0 or None)
        min_margin: Minimum required margin as decimal (e.g., 0.30 for 30%)
        default_ceiling_multiplier: Multiplier for ceiling when MSRP missing (default: 3.0)
        
    Returns:
        Dictionary containing:
        - floor: Minimum allowable price
        - ceiling: Maximum recommended price
        - floor_source: Source of floor constraint ('margin' or 'map')
        - ceiling_source: Source of ceiling constraint ('msrp' or 'default')
        - boundaries_valid: Whether floor <= ceiling
        - margin_based_floor: Floor from margin calculation
        - map_based_floor: Floor from MAP (0 if not applicable)
        - msrp_ceiling: Ceiling from MSRP (None if not applicable)
        - default_ceiling: Ceiling from default multiplier
        
    Raises:
        ValueError: If cost <= 0, min_margin >= 1.0, or default_ceiling_multiplier <= 1.0
        
    Examples:
        >>> calculate_pricing_boundaries(50.0, 89.99, 129.99, 0.30)
        {
            'floor': 89.99,
            'ceiling': 129.99,
            'floor_source': 'map',
            'ceiling_source': 'msrp',
            'boundaries_valid': True,
            'margin_based_floor': 71.43,
            'map_based_floor': 89.99,
            'msrp_ceiling': 129.99,
            'default_ceiling': 150.0
        }
        
        >>> calculate_pricing_boundaries(50.0, 0, 0, 0.30)
        {
            'floor': 71.43,
            'ceiling': 150.0,
            'floor_source': 'margin',
            'ceiling_source': 'default',
            'boundaries_valid': True,
            'margin_based_floor': 71.43,
            'map_based_floor': 0,
            'msrp_ceiling': None,
            'default_ceiling': 150.0
        }
    """
    # Calculate floor and ceiling
    floor = calculate_price_floor(cost, map_price, min_margin)
    ceiling = calculate_price_ceiling(cost, msrp, default_ceiling_multiplier)
    
    # Calculate individual components for transparency
    margin_based_floor = cost / (1 - min_margin)
    map_based_floor = map_price if map_price and map_price > 0 else 0
    msrp_ceiling = msrp if msrp and msrp > 0 else None
    default_ceiling = cost * default_ceiling_multiplier
    
    # Determine sources
    floor_source = 'map' if map_based_floor > margin_based_floor else 'margin'
    ceiling_source = 'msrp' if msrp_ceiling is not None else 'default'
    
    # Validate boundaries
    boundaries_valid = floor <= ceiling
    
    return {
        'floor': floor,
        'ceiling': ceiling,
        'floor_source': floor_source,
        'ceiling_source': ceiling_source,
        'boundaries_valid': boundaries_valid,
        'margin_based_floor': margin_based_floor,
        'map_based_floor': map_based_floor,
        'msrp_ceiling': msrp_ceiling,
        'default_ceiling': default_ceiling
    }