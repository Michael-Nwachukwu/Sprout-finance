// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./InvoiceNFT.sol";
import "./FXOracle.sol";
import "./CreditScoreRegistry.sol";
import "./InsurancePool.sol";

/// @title LendingPool
/// @notice Core lending logic — fractional lender funding, borrower repayment, default handling.
contract LendingPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    InvoiceNFT public invoiceNFT;
    FXOracle public fxOracle;
    CreditScoreRegistry public creditRegistry;
    InsurancePool public insurancePool;

    uint256 public constant GRACE_PERIOD = 7 days;
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant DAYS_PER_YEAR = 365;

    struct LoanPosition {
        address lender;
        uint256 principal;
        uint256 sharesBps; // basis points of total loan
        bool repaid;
    }

    struct Loan {
        uint256 tokenId;
        address borrower;
        uint256 totalFunded;
        uint256 maxFundable; // faceValueUSD * maxLtvBps / 10000 (18 decimals)
        uint256 discountRateBps;
        uint256 openedAt;
        uint256 dueDate;
        bool active; // USDC disbursed to borrower
        bool defaulted;
        uint256 positionCount;
    }

    mapping(uint256 => Loan) public loans; // tokenId => Loan
    mapping(uint256 => mapping(uint256 => LoanPosition)) public positions; // tokenId => positionId => Position
    uint256[] private _activeTokenIds; // ordered list for marketplace reads
    mapping(uint256 => uint256) private _activeTokenIndex; // tokenId => 1-based index in _activeTokenIds

    event CollateralDeposited(uint256 indexed tokenId, address indexed borrower, uint256 maxFundable);
    event InvoiceFunded(uint256 indexed tokenId, address indexed lender, uint256 amount, uint256 positionId);
    event LoanActivated(uint256 indexed tokenId, address indexed borrower, uint256 disbursed);
    event LoanRepaid(uint256 indexed tokenId, address indexed borrower, uint256 totalRepaid);
    event DefaultTriggered(uint256 indexed tokenId, address indexed borrower, uint256 shortfall);
    event PositionRepaid(uint256 indexed tokenId, uint256 indexed positionId, address indexed lender, uint256 amount);

    constructor(
        address _usdc,
        address _invoiceNFT,
        address _fxOracle,
        address _creditRegistry,
        address _insurancePool
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "LendingPool: zero address");
        require(_invoiceNFT != address(0), "LendingPool: zero address");
        require(_fxOracle != address(0), "LendingPool: zero address");
        require(_creditRegistry != address(0), "LendingPool: zero address");
        require(_insurancePool != address(0), "LendingPool: zero address");
        usdc = IERC20(_usdc);
        invoiceNFT = InvoiceNFT(_invoiceNFT);
        fxOracle = FXOracle(_fxOracle);
        creditRegistry = CreditScoreRegistry(_creditRegistry);
        insurancePool = InsurancePool(_insurancePool);
    }

    /// @notice Borrower deposits their invoice NFT as collateral, opening it for lender funding.
    /// @param tokenId The minted invoice NFT token ID
    function depositCollateral(uint256 tokenId) external nonReentrant {
        InvoiceNFT.InvoiceData memory invoice = invoiceNFT.getInvoice(tokenId);
        require(invoice.borrower == msg.sender, "LendingPool: not the borrower");
        require(invoice.riskTier > 0, "LendingPool: risk not assessed yet");
        require(!invoice.isCollateralized, "LendingPool: already collateralized");
        require(!creditRegistry.isBlacklisted(msg.sender), "LendingPool: borrower blacklisted");
        require(loans[tokenId].borrower == address(0), "LendingPool: loan already exists");
        require(invoice.dueDate > block.timestamp, "LendingPool: invoice already due");

        // maxFundable = faceValueUSD * maxLtvBps / 10000
        // faceValueUSD is 18 decimals; convert to USDC 6 decimals for actual USDC transfers
        uint256 maxFundableUSD18 = (invoice.faceValueUSD * invoice.maxLtvBps) / BPS_DENOMINATOR;
        // Convert from 18 decimals to 6 decimals (USDC)
        uint256 maxFundableUSDC = maxFundableUSD18 / 1e12;

        // Transfer NFT from borrower to this contract
        invoiceNFT.transferFrom(msg.sender, address(this), tokenId);
        invoiceNFT.markCollateralized(tokenId);

        loans[tokenId] = Loan({
            tokenId: tokenId,
            borrower: msg.sender,
            totalFunded: 0,
            maxFundable: maxFundableUSDC,
            discountRateBps: invoice.discountRateBps,
            openedAt: block.timestamp,
            dueDate: invoice.dueDate,
            active: false,
            defaulted: false,
            positionCount: 0
        });

        _activeTokenIndex[tokenId] = _activeTokenIds.length + 1; // 1-based
        _activeTokenIds.push(tokenId);

        emit CollateralDeposited(tokenId, msg.sender, maxFundableUSDC);
    }

    /// @notice Lender funds an invoice. Once fully funded, USDC is released to the borrower.
    /// @param tokenId The invoice NFT token ID to fund
    /// @param amount Amount of USDC (6 decimals) to contribute
    function fundInvoice(uint256 tokenId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[tokenId];
        require(loan.borrower != address(0), "LendingPool: loan not found");
        require(!loan.active, "LendingPool: loan already active");
        require(!loan.defaulted, "LendingPool: loan defaulted");
        require(amount > 0, "LendingPool: zero amount");
        require(loan.dueDate > block.timestamp, "LendingPool: invoice due");

        uint256 remaining = loan.maxFundable - loan.totalFunded;
        require(remaining > 0, "LendingPool: fully funded");

        // Cap contribution to remaining
        uint256 contribution = amount > remaining ? remaining : amount;

        usdc.safeTransferFrom(msg.sender, address(this), contribution);

        uint256 sharesBps = (contribution * BPS_DENOMINATOR) / loan.maxFundable;
        uint256 positionId = loan.positionCount++;
        positions[tokenId][positionId] = LoanPosition({
            lender: msg.sender,
            principal: contribution,
            sharesBps: sharesBps,
            repaid: false
        });

        loan.totalFunded += contribution;

        emit InvoiceFunded(tokenId, msg.sender, contribution, positionId);

        // If fully funded, disburse to borrower and activate loan
        if (loan.totalFunded >= loan.maxFundable) {
            loan.active = true;
            usdc.safeTransfer(loan.borrower, loan.totalFunded);
            emit LoanActivated(tokenId, loan.borrower, loan.totalFunded);
        }
    }

    /// @notice Borrower repays the full outstanding amount.
    /// @param tokenId The invoice NFT token ID
    function repay(uint256 tokenId) external nonReentrant {
        Loan storage loan = loans[tokenId];
        require(loan.borrower == msg.sender, "LendingPool: not the borrower");
        require(loan.active, "LendingPool: loan not active");
        require(!loan.defaulted, "LendingPool: loan defaulted");

        uint256 amountOwed = _calculateAmountOwed(tokenId);
        usdc.safeTransferFrom(msg.sender, address(this), amountOwed);

        _distributeRepayment(tokenId, amountOwed);

        invoiceNFT.markRepaid(tokenId);
        invoiceNFT.burn(tokenId);

        creditRegistry.recordRepayment(loan.borrower, block.timestamp <= loan.dueDate + GRACE_PERIOD);

        emit LoanRepaid(tokenId, loan.borrower, amountOwed);

        _removeActiveToken(tokenId);
        delete loans[tokenId];
    }

    /// @notice Trigger default after grace period. Callable by anyone.
    /// @param tokenId The invoice NFT token ID
    function triggerDefault(uint256 tokenId) external nonReentrant {
        Loan storage loan = loans[tokenId];
        require(loan.active, "LendingPool: loan not active");
        require(!loan.defaulted, "LendingPool: already defaulted");
        require(
            block.timestamp > loan.dueDate + GRACE_PERIOD,
            "LendingPool: grace period not over"
        );

        loan.defaulted = true;
        uint256 amountOwed = _calculateAmountOwed(tokenId);

        // Try to cover shortfall from insurance pool
        uint256 availableInPool = usdc.balanceOf(address(this));
        uint256 shortfall = amountOwed > availableInPool ? amountOwed - availableInPool : 0;

        if (shortfall > 0) {
            // Approve insurance pool to pull from us (it transfers back)
            uint256 covered = insurancePool.coverDefault(shortfall);
            availableInPool += covered;
            shortfall = shortfall > covered ? shortfall - covered : 0;
        }

        uint256 distributable = availableInPool < amountOwed ? availableInPool : amountOwed;
        _distributeRepayment(tokenId, distributable);

        creditRegistry.recordRepayment(loan.borrower, false);
        creditRegistry.blacklist(loan.borrower);

        invoiceNFT.burn(tokenId);

        emit DefaultTriggered(tokenId, loan.borrower, shortfall);

        _removeActiveToken(tokenId);
        delete loans[tokenId];
    }

    /// @notice Calculate the total amount owed (principal + interest) for a loan
    /// @param tokenId The invoice NFT token ID
    /// @return Total USDC owed (6 decimals)
    function getAmountOwed(uint256 tokenId) external view returns (uint256) {
        return _calculateAmountOwed(tokenId);
    }

    /// @notice Get health factor for a loan (scaled by 1e4, >10000 = healthy)
    /// @dev Health factor = dueDate remaining / total elapsed days * 10000
    function getHealthFactor(uint256 tokenId) external view returns (uint256) {
        Loan storage loan = loans[tokenId];
        require(loan.active, "LendingPool: loan not active");
        if (block.timestamp >= loan.dueDate) return 0;
        uint256 totalDuration = loan.dueDate - loan.openedAt;
        if (totalDuration == 0) return 0;
        uint256 remaining = loan.dueDate - block.timestamp;
        return (remaining * BPS_DENOMINATOR) / totalDuration;
    }

    /// @notice Get all lender positions for a loan
    function getLoanPositions(uint256 tokenId) external view returns (LoanPosition[] memory) {
        Loan storage loan = loans[tokenId];
        LoanPosition[] memory result = new LoanPosition[](loan.positionCount);
        for (uint256 i = 0; i < loan.positionCount; i++) {
            result[i] = positions[tokenId][i];
        }
        return result;
    }

    /// @notice Returns all currently active token IDs (listed for funding or active loans)
    function getActiveTokenIds() external view returns (uint256[] memory) {
        return _activeTokenIds;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /// @dev principal * discountRateBps * elapsedDays / (365 * 10000)
    function _calculateInterest(uint256 principal, uint256 discountRateBps, uint256 elapsedSeconds)
        internal
        pure
        returns (uint256)
    {
        uint256 elapsedDays = elapsedSeconds / 1 days;
        if (elapsedDays == 0) elapsedDays = 1; // minimum 1 day
        return (principal * discountRateBps * elapsedDays) / (DAYS_PER_YEAR * BPS_DENOMINATOR);
    }

    function _calculateAmountOwed(uint256 tokenId) internal view returns (uint256) {
        Loan storage loan = loans[tokenId];
        if (!loan.active) return 0;
        uint256 elapsed = block.timestamp > loan.openedAt ? block.timestamp - loan.openedAt : 0;
        uint256 interest = _calculateInterest(loan.totalFunded, loan.discountRateBps, elapsed);
        return loan.totalFunded + interest;
    }

    function _removeActiveToken(uint256 tokenId) internal {
        uint256 idx = _activeTokenIndex[tokenId];
        if (idx == 0) return; // not in list
        uint256 i = idx - 1; // 0-based
        uint256 last = _activeTokenIds[_activeTokenIds.length - 1];
        _activeTokenIds[i] = last;
        _activeTokenIndex[last] = idx; // maintain 1-based index
        _activeTokenIds.pop();
        delete _activeTokenIndex[tokenId];
    }

    function _distributeRepayment(uint256 tokenId, uint256 totalAmount) internal {
        Loan storage loan = loans[tokenId];
        uint256 amountOwed = _calculateAmountOwed(tokenId);
        uint256 totalInterest = amountOwed > loan.totalFunded ? amountOwed - loan.totalFunded : 0;

        // Protocol fee = 2% of interest only
        uint256 protocolFee = (totalInterest * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 distributableAfterFee = totalAmount > protocolFee ? totalAmount - protocolFee : 0;

        // Send protocol fee to insurance pool via direct transfer (OZ v5: no safeApprove)
        if (protocolFee > 0 && protocolFee <= usdc.balanceOf(address(this))) {
            usdc.safeTransfer(address(insurancePool), protocolFee);
            insurancePool.depositFees(protocolFee);
        }

        // Distribute remainder pro-rata to lenders
        for (uint256 i = 0; i < loan.positionCount; i++) {
            LoanPosition storage pos = positions[tokenId][i];
            if (pos.repaid) continue;
            uint256 lenderShare = (distributableAfterFee * pos.sharesBps) / BPS_DENOMINATOR;
            if (lenderShare > 0) {
                pos.repaid = true;
                usdc.safeTransfer(pos.lender, lenderShare);
                emit PositionRepaid(tokenId, i, pos.lender, lenderShare);
            }
        }
    }
}
