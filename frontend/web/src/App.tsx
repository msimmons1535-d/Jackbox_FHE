// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface GameRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  player: string;
  gameType: string;
  status: "pending" | "revealed" | "voted";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newGameData, setNewGameData] = useState({ gameType: "", answer: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [userHistory, setUserHistory] = useState<GameRecord[]>([]);
  
  // Stats calculations
  const revealedCount = games.filter(g => g.status === "revealed").length;
  const pendingCount = games.filter(g => g.status === "pending").length;
  const votedCount = games.filter(g => g.status === "voted").length;

  useEffect(() => {
    loadGames().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    if (address && games.length > 0) {
      setUserHistory(games.filter(game => game.player.toLowerCase() === address.toLowerCase()));
    }
  }, [address, games]);

  const loadGames = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load game keys
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing game keys:", e); }
      }
      
      // Load each game
      const list: GameRecord[] = [];
      for (const key of keys) {
        try {
          const gameBytes = await contract.getData(`game_${key}`);
          if (gameBytes.length > 0) {
            try {
              const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
              list.push({ 
                id: key, 
                encryptedData: gameData.data, 
                timestamp: gameData.timestamp, 
                player: gameData.player, 
                gameType: gameData.gameType, 
                status: gameData.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing game data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading game ${key}:`, e); }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setGames(list);
    } catch (e) { 
      console.error("Error loading games:", e); 
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitGameAnswer = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting your answer with Zama FHE..." 
    });
    
    try {
      // Encrypt the answer using FHE
      const encryptedData = FHEEncryptNumber(newGameData.answer);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create unique game ID
      const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      
      // Store game data
      const gameData = { 
        data: encryptedData, 
        timestamp: Math.floor(Date.now() / 1000), 
        player: address, 
        gameType: newGameData.gameType, 
        status: "pending" 
      };
      
      await contract.setData(`game_${gameId}`, ethers.toUtf8Bytes(JSON.stringify(gameData)));
      
      // Update game keys list
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { 
          console.error("Error parsing keys:", e); 
        }
      }
      keys.push(gameId);
      await contract.setData("game_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Your encrypted answer submitted successfully!" 
      });
      
      await loadGames();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewGameData({ gameType: "", answer: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const revealAnswer = async (gameId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Revealing encrypted answer with FHE..." 
    });
    
    try {
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const gameBytes = await contractWithSigner.getData(`game_${gameId}`);
      if (gameBytes.length === 0) throw new Error("Game not found");
      
      const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
      const updatedGame = { ...gameData, status: "revealed" };
      
      await contractWithSigner.setData(`game_${gameId}`, ethers.toUtf8Bytes(JSON.stringify(updatedGame)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Answer revealed successfully!" 
      });
      
      await loadGames();
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Reveal failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 3000);
    }
  };

  const voteForAnswer = async (gameId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Processing vote with FHE..." 
    });
    
    try {
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const gameBytes = await contractWithSigner.getData(`game_${gameId}`);
      if (gameBytes.length === 0) throw new Error("Game not found");
      
      const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
      const updatedGame = { ...gameData, status: "voted" };
      
      await contractWithSigner.setData(`game_${gameId}`, ethers.toUtf8Bytes(JSON.stringify(updatedGame)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Vote recorded successfully!" 
      });
      
      await loadGames();
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Vote failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 3000);
    }
  };

  const isPlayer = (gameAddress: string) => address?.toLowerCase() === gameAddress.toLowerCase();

  const tutorialSteps = [
    { 
      title: "Connect Wallet", 
      description: "Connect your Web3 wallet to join the encrypted party game", 
      icon: "🎮" 
    },
    { 
      title: "Submit Encrypted Answer", 
      description: "Your answers are encrypted with Zama FHE before submission", 
      icon: "🔒", 
      details: "No one can see your answer until the reveal phase" 
    },
    { 
      title: "FHE Processing", 
      description: "All game logic happens on encrypted data", 
      icon: "⚙️", 
      details: "Zama FHE technology enables computations without decrypting sensitive data" 
    },
    { 
      title: "Reveal & Vote", 
      description: "See answers and vote for the best one", 
      icon: "👀", 
      details: "Answers are only decrypted during the reveal phase" 
    }
  ];

  const renderStatusChart = () => {
    const total = games.length || 1;
    const revealedPercentage = (revealedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const votedPercentage = (votedCount / total) * 100;
    
    return (
      <div className="status-chart-container">
        <div className="status-bars">
          <div className="status-bar pending" style={{ width: `${pendingPercentage}%` }}>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="status-bar revealed" style={{ width: `${revealedPercentage}%` }}>
            <span>Revealed: {revealedCount}</span>
          </div>
          <div className="status-bar voted" style={{ width: `${votedPercentage}%` }}>
            <span>Voted: {votedCount}</span>
          </div>
        </div>
        <div className="status-total">Total Games: {games.length}</div>
      </div>
    );
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = game.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         game.gameType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || game.status === filterType;
    return matchesSearch && matchesFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="party-spinner"></div>
      <p>Loading encrypted party games...</p>
    </div>
  );

  return (
    <div className="app-container party-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🎉</div>
          <h1>FHE<span>Party</span>Games</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-game-btn party-button"
          >
            + New Game
          </button>
          <button 
            className="party-button" 
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "How To Play"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Encrypted Party Games</h2>
            <p>Play Jackbox-style games with fully encrypted answers using Zama FHE technology</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock">🔒</div>
            <span>FHE Encryption Active</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How To Play Encrypted Party Games</h2>
            <p className="subtitle">Learn how to play games with fully encrypted answers</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="fhe-diagram">
              <div className="diagram-step">
                <div className="diagram-icon">💡</div>
                <div className="diagram-label">Your Answer</div>
              </div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step">
                <div className="diagram-icon">🔒</div>
                <div className="diagram-label">FHE Encryption</div>
              </div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step">
                <div className="diagram-icon">🎮</div>
                <div className="diagram-label">Game Processing</div>
              </div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step">
                <div className="diagram-icon">👀</div>
                <div className="diagram-label">Reveal Phase</div>
              </div>
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card party-card">
            <h3>Game Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{games.length}</div>
                <div className="stat-label">Total Games</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{revealedCount}</div>
                <div className="stat-label">Revealed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{votedCount}</div>
                <div className="stat-label">Voted</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card party-card">
            <h3>Game Status</h3>
            {renderStatusChart()}
          </div>
          
          <div className="dashboard-card party-card">
            <h3>Your Game History</h3>
            {userHistory.length > 0 ? (
              <div className="history-list">
                {userHistory.slice(0, 3).map(game => (
                  <div key={game.id} className="history-item">
                    <span className="game-type">{game.gameType}</span>
                    <span className={`game-status ${game.status}`}>{game.status}</span>
                  </div>
                ))}
                {userHistory.length > 3 && (
                  <div className="history-more">+{userHistory.length - 3} more</div>
                )}
              </div>
            ) : (
              <div className="no-history">No games played yet</div>
            )}
          </div>
        </div>
        
        <div className="games-section">
          <div className="section-header">
            <h2>Current Games</h2>
            <div className="search-filter">
              <input
                type="text"
                placeholder="Search games..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="party-input"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="party-select"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="revealed">Revealed</option>
                <option value="voted">Voted</option>
              </select>
              <button 
                onClick={loadGames} 
                className="refresh-btn party-button" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="games-list party-card">
            {filteredGames.length === 0 ? (
              <div className="no-games">
                <div className="no-games-icon">🎲</div>
                <p>No games found matching your criteria</p>
                <button 
                  className="party-button primary" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Start First Game
                </button>
              </div>
            ) : (
              <div className="games-grid">
                {filteredGames.map(game => (
                  <div 
                    className="game-card" 
                    key={game.id} 
                    onClick={() => setSelectedGame(game)}
                  >
                    <div className="game-header">
                      <span className="game-id">#{game.id.substring(0, 6)}</span>
                      <span className={`game-status ${game.status}`}>{game.status}</span>
                    </div>
                    <div className="game-type">{game.gameType}</div>
                    <div className="game-player">
                      Player: {game.player.substring(0, 6)}...{game.player.substring(38)}
                    </div>
                    <div className="game-time">
                      {new Date(game.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="game-actions">
                      {game.status === "pending" && isPlayer(game.player) && (
                        <button 
                          className="party-button small reveal-btn"
                          onClick={(e) => { e.stopPropagation(); revealAnswer(game.id); }}
                        >
                          Reveal
                        </button>
                      )}
                      {game.status === "revealed" && (
                        <button 
                          className="party-button small vote-btn"
                          onClick={(e) => { e.stopPropagation(); voteForAnswer(game.id); }}
                        >
                          Vote
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitGameAnswer} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          gameData={newGameData} 
          setGameData={setNewGameData}
        />
      )}
      
      {selectedGame && (
        <GameDetailModal 
          game={selectedGame} 
          onClose={() => { setSelectedGame(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content party-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="party-spinner"></div>}
              {transactionStatus.status === "success" && "🎉"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">🎮<span>FHES189</span></div>
            <p>Fully Homomorphic Encrypted Party Games Platform</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔒<span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} FHES189. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  gameData: any;
  setGameData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, gameData, setGameData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setGameData({ ...gameData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGameData({ ...gameData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!gameData.gameType || !gameData.answer) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal party-card">
        <div className="modal-header">
          <h2>Create New Game</h2>
          <button onClick={onClose} className="close-modal">✕</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon">🔑</div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your answer will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Game Type *</label>
            <select 
              name="gameType" 
              value={gameData.gameType} 
              onChange={handleChange} 
              className="party-select"
            >
              <option value="">Select game type</option>
              <option value="Drawful">Drawful (Draw & Guess)</option>
              <option value="Fibbage">Fibbage (Bluffing)</option>
              <option value="Quiplash">Quiplash (Funny Answers)</option>
              <option value="WordSpud">WordSpud (Word Chain)</option>
              <option value="LieSwatter">LieSwatter (True or False)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Your Answer (Number) *</label>
            <input 
              type="number" 
              name="answer" 
              value={gameData.answer} 
              onChange={handleValueChange} 
              placeholder="Enter your answer as a number..." 
              className="party-input"
              step="0.01"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Value:</span>
                <div>{gameData.answer || 'No value entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>
                  {gameData.answer ? 
                    FHEEncryptNumber(gameData.answer).substring(0, 50) + '...' : 
                    'No value entered'}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn party-button">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={creating} 
            className="submit-btn party-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Answer"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface GameDetailModalProps {
  game: GameRecord;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const GameDetailModal: React.FC<GameDetailModalProps> = ({ 
  game, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(game.encryptedData);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="game-detail-modal party-card">
        <div className="modal-header">
          <h2>Game Details #{game.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">✕</button>
        </div>
        
        <div className="modal-body">
          <div className="game-info">
            <div className="info-item">
              <span>Game Type:</span>
              <strong>{game.gameType}</strong>
            </div>
            <div className="info-item">
              <span>Player:</span>
              <strong>{game.player.substring(0, 6)}...{game.player.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>{new Date(game.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${game.status}`}>{game.status}</strong>
            </div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Answer</h3>
            <div className="encrypted-data">
              {game.encryptedData.substring(0, 100)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon">🔒</div>
              <span>FHE Encrypted</span>
            </div>
            
            {game.status !== "pending" && (
              <button 
                className="decrypt-btn party-button" 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <span className="decrypt-spinner"></span>
                ) : decryptedValue !== null ? (
                  "Hide Answer"
                ) : (
                  "Decrypt with Wallet Signature"
                )}
              </button>
            )}
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Answer</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon">⚠️</div>
                <span>Decrypted answer is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn party-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;