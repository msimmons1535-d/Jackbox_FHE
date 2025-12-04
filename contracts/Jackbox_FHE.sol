pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract JackboxFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error StaleWrite();
    error InvalidStateHash();
    error AlreadyProcessed();
    error InvalidConfigValue();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed caller);
    event Unpaused(address indexed caller);
    event CooldownUpdated(uint256 oldInterval, uint256 newInterval);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event MaxBatchSizeUpdated(uint256 oldSize, uint256 newSize);
    event Submission(
        address indexed player,
        uint256 indexed batchId,
        bytes32 encryptedInput
    );
    event DecryptionRequested(
        uint256 indexed requestId,
        uint256 indexed batchId,
        bytes32 stateHash
    );
    event DecryptionComplete(
        uint256 indexed requestId,
        uint256 indexed batchId,
        uint256 aggregateScore
    );

    bool public paused;
    uint256 public cooldownInterval = 5 seconds;
    uint256 public maxBatchSize = 10;
    uint256 public modelVersion = 1;

    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;

    struct Batch {
        bool isOpen;
        uint256 numSubmissions;
        euint32 aggregateScore;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownInterval) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        isProvider[owner] = true;
        isProvider[msg.sender] = true;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownInterval(uint256 newInterval) external onlyOwner {
        if (newInterval == cooldownInterval) revert InvalidConfigValue();
        uint256 oldInterval = cooldownInterval;
        cooldownInterval = newInterval;
        emit CooldownUpdated(oldInterval, newInterval);
    }

    function setMaxBatchSize(uint256 newSize) external onlyOwner {
        if (newSize == maxBatchSize) revert InvalidConfigValue();
        if (newSize == 0) revert InvalidConfigValue();
        uint256 oldSize = maxBatchSize;
        maxBatchSize = newSize;
        emit MaxBatchSizeUpdated(oldSize, newSize);
    }

    function addProvider(address provider) external onlyOwner {
        if (isProvider[provider]) revert InvalidConfigValue();
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) revert InvalidConfigValue();
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function openBatch() external onlyProvider whenNotPaused checkCooldown {
        uint256 batchId = modelVersion;
        if (batches[batchId].isOpen) revert InvalidBatch();
        batches[batchId] = Batch({
            isOpen: true,
            numSubmissions: 0,
            aggregateScore: FHE.asEuint32(0)
        });
        lastActionAt[msg.sender] = block.timestamp;
        emit BatchOpened(batchId, msg.sender);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused checkCooldown {
        if (!batches[batchId].isOpen) revert BatchClosed();
        batches[batchId].isOpen = false;
        lastActionAt[msg.sender] = block.timestamp;
        emit BatchClosed(batchId, msg.sender);
    }

    function submitEncryptedInput(
        uint256 batchId,
        euint32 encryptedScore
    ) external whenNotPaused checkCooldown {
        if (!batches[batchId].isOpen) revert BatchClosed();
        if (batches[batchId].numSubmissions >= maxBatchSize) revert BatchFull();
        if (hasSubmitted[batchId][msg.sender]) revert InvalidBatch();

        _requireInitialized(encryptedScore, "encryptedScore");
        batches[batchId].aggregateScore = FHE.add(
            batches[batchId].aggregateScore,
            encryptedScore
        );
        batches[batchId].numSubmissions++;
        hasSubmitted[batchId][msg.sender] = true;
        lastActionAt[msg.sender] = block.timestamp;

        emit Submission(
            msg.sender,
            batchId,
            FHE.toBytes32(encryptedScore)
        );
    }

    function requestBatchDecryption(uint256 batchId) external whenNotPaused checkCooldown {
        if (batches[batchId].isOpen) revert InvalidBatch();
        if (batches[batchId].numSubmissions == 0) revert InvalidBatch();

        euint32 memory acc = batches[batchId].aggregateScore;
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(acc);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleBatchDecryption.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function handleBatchDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert AlreadyProcessed();

        DecryptionContext memory ctx = decryptionContexts[requestId];
        require(ctx.batchId != 0, "Invalid context");

        // Rebuild current ciphertexts in the same order
        euint32 memory currentAcc = batches[ctx.batchId].aggregateScore;
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(currentAcc);

        // Verify state consistency
        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != ctx.stateHash) revert InvalidStateHash();

        // Verify proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts (same order as cts)
        uint32 aggregateScore = abi.decode(cleartexts, (uint32));

        // Emit minimal plaintext result
        emit DecryptionComplete(requestId, ctx.batchId, aggregateScore);

        // Mark as processed
        decryptionContexts[requestId].processed = true;
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal pure returns (euint32) {
        if (!FHE.isInitialized(x)) {
            return FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}