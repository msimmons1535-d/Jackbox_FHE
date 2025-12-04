# Jackbox FHE: A Privacy-First Party Game Platform 🎉

Jackbox FHE is a revolutionary party game platform that redefines social gaming with the power of Zama's Fully Homomorphic Encryption technology. This platform not only brings a collection of engaging party games to life but does so with the assurance that all player inputs—such as drawings and responses—remain confidential until the very moment they are ready to be revealed. Join the fun and enjoy a unique party experience while knowing that your creativity is protected!

## The Challenge of Party Gaming 🎭

In traditional party games, players often share their thoughts and creative outputs in real-time, which can lead to transparency issues. Participants’ ideas might be exposed before they are meant to be revealed, diminishing the surprise and excitement that are integral to the gaming experience. Especially in live-streamed environments, ensuring that inputs remain confidential while still enabling dynamic interactions is a significant challenge. 

## Zama's FHE Solution 🔐

By leveraging Zama's Fully Homomorphic Encryption technology, Jackbox FHE ensures that all game inputs are encrypted throughout the gameplay process. This means that even while your drawings and answers are being created, they are securely hidden from prying eyes. Only during the reveal and voting phases are the inputs decrypted, maintaining the element of surprise and ensuring fair gameplay.

Our implementation utilizes Zama's open-source libraries, including the **Concrete** and **TFHE-rs**, which provide a robust framework for confidential computing, ensuring players can engage fully without fear of their ideas being compromised.

## Core Features 🌟

- **FHE Encrypted Inputs:** Players' entries are encrypted at all times, ensuring surprises remain intact until the reveal.
- **Fair and Transparent Voting:** The integrity of voting is preserved since inputs are only decrypted at the moment of display, allowing for a fair assessment of the creative outputs.
- **Live Interaction Friendly:** Designed specifically for live streaming, making it ideal for engaging audiences during broadcasts.
- **Multiple Game Types:** A variety of party games that cater to different interests and group sizes, all featuring core mechanics enhanced by FHE.
- **Mobile Controller Integration:** Use your smartphone as a controller while the main game is displayed on a larger screen, enabling seamless interaction.

## Technology Stack 🛠️

- **Zama SDKs:** Utilizes **Concrete** and **TFHE-rs** for FHE capabilities
- **Node.js:** For backend development and game logic
- **Hardhat/Foundry:** For smart contract deployment and testing
- **React.js:** For building an engaging user interface
- **WebSocket:** To enable real-time communication among players

## Directory Structure 🗂️

```plaintext
Jackbox_FHE/
├── contracts/
│   └── Jackbox_FHE.sol
├── src/
│   ├── index.js
│   ├── gameLogic.js
│   └── ui/
│       ├── App.js
│       └── components/
├── package.json
└── README.md
```

## Installation Instructions ⚙️

To set up your local environment and run Jackbox FHE, please follow these steps:

1. **Prerequisites:**
   - Ensure you have Node.js installed.
   - Install Hardhat or Foundry according to your preference.
   
2. **Download the Project:**
   - Do **not** use `git clone` or any URLs. Instead, download the project files manually or retrieve them through your preferred method.
  
3. **Install Dependencies:**
   - Navigate to the project directory in your terminal and run:
     ```bash
     npm install
     ```
   - This will install all the necessary dependencies, including Zama's FHE libraries.

## Build & Run Instructions 🚀

To compile, test, and launch the Jackbox FHE platform, execute the following commands in your terminal:

1. **Compile the Smart Contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run Tests:**
   ```bash
   npx hardhat test
   ```

3. **Run the Development Server:**
   ```bash
   npm start
   ```
   This will launch the application in your default web browser, allowing you to start playing games either locally or inviting friends online.

## Example Code Snippet 📝

Here’s a small code snippet demonstrating how player inputs can be encrypted before being sent to the verification process:

```javascript
import { encryptInput } from 'zama-fhe-sdk';

function handlePlayerInput(input) {
    const encryptedInput = encryptInput(input);
    // Send encrypted input to the game logic for processing
    gameLogic.processInput(encryptedInput);
}
```

This function takes the player input, encrypts it using the Zama SDK, and forwards it to the game logic, ensuring that all data is confidential.

## Acknowledgements 🙏

**Powered by Zama**: We extend our deepest gratitude to the Zama team for their pioneering efforts in developing the tools that make confidential blockchain applications a reality. Your innovation in the field of Fully Homomorphic Encryption has empowered us to create a unique and secure gaming experience that prioritizes user privacy.

Join us in transforming the way we play party games with Jackbox FHE, and let the fun begin under the assurance of complete privacy! 🎉